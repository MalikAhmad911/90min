import { createHash } from 'node:crypto'
import { and, eq, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { rateLimitEvents } from '@/lib/db/schema'

/**
 * Sliding-window rate limiting for OUR endpoints (login, admin writes).
 *
 * Not to be confused with `rate-limiter.ts`, which paces this app's own calls
 * to football-data.org inside one process.
 *
 * Hits live in Postgres (`rate_limit_events`) rather than in memory on
 * purpose: a serverless host runs many short-lived instances, and an in-memory
 * counter would hand every fresh instance a fresh budget - an attacker would
 * simply get a new allowance on each cold start.
 *
 * Node runtime only (node:crypto, database driver).
 */

export interface RateLimitOptions {
  /** Hits allowed inside one window, including the current one. */
  limit: number
  /** Window length in ms. At most PRUNE_AFTER_MS, or pruning would eat live hits. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Hits still available in the current window after this one. */
  remaining: number
  /** Seconds until a new hit would be allowed; 0 when allowed. */
  retryAfterSec: number
}

/** What the limiter needs from storage. The database store is the real one. */
export interface HitStore {
  /** Records one hit. Must be committed (visible to others) when it resolves. */
  record(bucket: string, key: string): Promise<void>
  /**
   * Looks at the hits inside the window ending now:
   * - `count`: how many there are, capped at `limit + 1` (enough to decide);
   * - `pivotMs`: time of the `limit`-th most recent hit, or null if fewer;
   * - `nowMs`: the store's clock, so every instance shares one notion of now.
   */
  window(bucket: string, key: string, windowMs: number, limit: number): Promise<WindowSnapshot>
  /** Forgets every hit for one key. */
  clear(bucket: string, key: string): Promise<void>
  /** Deletes hits older than `olderThanMs`, across all buckets. */
  prune(olderThanMs: number): Promise<void>
}

export interface WindowSnapshot {
  count: number
  pivotMs: number | null
  nowMs: number
}

/** Rows older than this are garbage for every limiter in the app. */
export const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * Chance that a call also prunes old rows. A delete on every request would
 * double the cost of each limited request for no benefit; at 1 in 50 the table
 * stays small (each prune clears everything older than a day) while busy
 * periods still trigger it often.
 */
export const PRUNE_PROBABILITY = 0.02

/* ------------------------------------------------------------------ *
 * Limits used by the app
 * ------------------------------------------------------------------ */

/** Every login attempt from one client IP, success or not. */
export const LOGIN_IP_LIMIT: RateLimitOptions = { limit: 10, windowMs: 15 * 60 * 1000 }

/**
 * Failed attempts against one username, from anywhere. This is what stops a
 * distributed guesser that rotates IPs. A successful login clears it.
 */
export const LOGIN_USER_LIMIT: RateLimitOptions = { limit: 5, windowMs: 15 * 60 * 1000 }

/**
 * Admin writes (streams, channels), per session. Generous for a human editing
 * a list, tight enough that a stolen cookie or a runaway script cannot flood
 * the tables.
 *
 * Public reads (/api/matches, /api/standings, ...) are deliberately NOT
 * limited here. They are cached at the CDN and cheap to serve; recording a row
 * in Postgres for each one would cost more than the abuse it prevents and turn
 * every page view into a database write.
 */
export const ADMIN_MUTATION_LIMIT: RateLimitOptions = { limit: 60, windowMs: 60 * 1000 }

/* ------------------------------------------------------------------ *
 * Pure window maths
 * ------------------------------------------------------------------ */

/**
 * Decides one request from a snapshot taken AFTER its own hit was recorded,
 * so `count` already includes it.
 *
 * Retry time: a new request is allowed once at most `limit - 1` hits remain in
 * the window. Of the hits now present, the `limit`-th most recent is the
 * newest one that has to expire for that to be true, so the wait is until it
 * leaves the window.
 */
export function decide(snapshot: WindowSnapshot, opts: RateLimitOptions): RateLimitResult {
  const { count, pivotMs, nowMs } = snapshot
  if (count <= opts.limit) {
    return { allowed: true, remaining: opts.limit - count, retryAfterSec: 0 }
  }
  const expiresAt = (pivotMs ?? nowMs) + opts.windowMs
  return {
    allowed: false,
    remaining: 0,
    retryAfterSec: Math.max(1, Math.ceil((expiresAt - nowMs) / 1000)),
  }
}

function assertOptions(bucket: string, opts: RateLimitOptions): void {
  if (!/^[a-z0-9:-]{1,40}$/.test(bucket)) throw new Error(`Invalid rate-limit bucket: ${bucket}`)
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new Error('limit must be a positive integer')
  if (!(opts.windowMs > 0) || opts.windowMs > PRUNE_AFTER_MS) {
    throw new Error(`windowMs must be in (0, ${PRUNE_AFTER_MS}]`)
  }
}

/**
 * Stored keys are hashed. They are client IPs and typed usernames - personal
 * data we have no reason to keep readable - and hashing also bounds their size
 * whatever a client sends.
 */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

/* ------------------------------------------------------------------ *
 * The limiter
 * ------------------------------------------------------------------ */

export interface LimiterDeps {
  store?: HitStore
  random?: () => number
}

/**
 * Records a hit for (bucket, key) and says whether it is within the limit.
 *
 * Order matters. The hit is inserted and committed FIRST, and only then are
 * the hits in the window counted, in a separate statement. Two simultaneous
 * requests therefore cannot both slip through: whichever counts last sees the
 * other's row. (Counting first, or inserting and counting in one statement,
 * lets both read the same pre-insert snapshot.) Denied requests keep their
 * hit, so hammering while blocked extends the block instead of probing it.
 */
export async function consume(
  bucket: string,
  key: string,
  opts: RateLimitOptions,
  deps: LimiterDeps = {}
): Promise<RateLimitResult> {
  assertOptions(bucket, opts)
  const store = deps.store ?? dbStore
  const hashed = hashKey(key)

  await store.record(bucket, hashed)
  const result = decide(await store.window(bucket, hashed, opts.windowMs, opts.limit), opts)

  if ((deps.random ?? Math.random)() < PRUNE_PROBABILITY) {
    // Housekeeping must never fail the request it rides on.
    await store.prune(PRUNE_AFTER_MS).catch(() => {})
  }
  return result
}

/** Forgets the hits for (bucket, key), e.g. failed logins after a success. */
export async function reset(bucket: string, key: string, deps: LimiterDeps = {}): Promise<void> {
  const store = deps.store ?? dbStore
  await store.clear(bucket, hashKey(key))
}

/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */

/**
 * The client's IP, for keying limits.
 *
 * `x-nf-client-connection-ip` is set by Netlify's edge and is the address it
 * actually saw. Elsewhere the first `x-forwarded-for` entry is the original
 * client. That entry can be forged where a proxy appends to the header rather
 * than replacing it - which is one reason failed logins are also limited per
 * username, independently of IP.
 */
export function clientIp(headers: Headers): string {
  const netlify = headers.get('x-nf-client-connection-ip')?.trim()
  if (netlify) return netlify.slice(0, 64)

  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded.slice(0, 64)

  return headers.get('x-real-ip')?.trim().slice(0, 64) || 'unknown'
}

export function tooManyRequests(
  result: RateLimitResult,
  message = 'Too many requests. Try again later.'
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } }
  )
}

/* ------------------------------------------------------------------ *
 * Postgres store
 * ------------------------------------------------------------------ */

export const dbStore: HitStore = {
  async record(bucket, key) {
    // Each statement on the Neon HTTP driver is its own committed transaction,
    // which is what makes the insert visible before our count runs.
    await getDb().insert(rateLimitEvents).values({ bucket, key })
  },

  async window(bucket, key, windowMs, limit) {
    // Both subqueries use the (bucket, key, hit_at) index. The count is capped
    // at limit + 1 so a key under heavy attack costs no more to check than
    // one just over its limit.
    const inWindow = sql`${rateLimitEvents.bucket} = ${bucket}
      and ${rateLimitEvents.key} = ${key}
      and ${rateLimitEvents.hitAt} > now() - (${windowMs}::int * interval '1 millisecond')`

    const result = await getDb().execute<{ n: number; pivot_ms: string | null; now_ms: string }>(sql`
      select
        (select count(*)::int from (
          select 1 from ${rateLimitEvents} where ${inWindow} limit ${limit + 1}::int
        ) capped) as n,
        (select extract(epoch from ${rateLimitEvents.hitAt}) * 1000 from ${rateLimitEvents}
          where ${inWindow}
          order by ${rateLimitEvents.hitAt} desc
          offset ${limit - 1}::int limit 1) as pivot_ms,
        extract(epoch from now()) * 1000 as now_ms
    `)

    const row = result.rows[0]
    return {
      count: Number(row?.n ?? 0),
      pivotMs: row?.pivot_ms == null ? null : Number(row.pivot_ms),
      nowMs: row ? Number(row.now_ms) : Date.now(),
    }
  },

  async clear(bucket, key) {
    await getDb()
      .delete(rateLimitEvents)
      .where(and(eq(rateLimitEvents.bucket, bucket), eq(rateLimitEvents.key, key)))
  },

  async prune(olderThanMs) {
    await getDb()
      .delete(rateLimitEvents)
      .where(lt(rateLimitEvents.hitAt, sql`now() - (${olderThanMs}::bigint * interval '1 millisecond')`))
  },
}
