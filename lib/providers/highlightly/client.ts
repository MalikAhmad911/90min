import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { rowsOf } from '@/lib/server/sync/sync-state'
import {
  parseLineups,
  parseMatchDetail,
  parseMatchList,
  type HlDetail,
  type HlLineups,
  type HlListMatch,
} from './parse'

/**
 * Highlightly client (https://highlightly.net, free Basic plan).
 *
 * The plan allows 100 requests a day in total, reset at midnight UTC, so
 * every request first reserves a unit of a daily budget kept in Postgres
 * (shared by every serverless instance) and the client refuses outright once
 * the cap is reached. The upstream `x-ratelimit-requests-remaining` header,
 * when present, pulls our count up to what upstream has seen - requests made
 * from elsewhere with the same key count too.
 *
 * The key travels only in the request header; it is never logged, and
 * errors carry the path and status only.
 */

export const HIGHLIGHTLY_BASE = 'https://soccer.highlightly.net'
const USER_AGENT = '90MinTactics/1.0 (football scores app)'
const TIMEOUT_MS = 10_000
/** Upstream daily allowance on the free plan. */
export const UPSTREAM_DAILY_LIMIT = 100
/** Our own ceiling, leaving slack for manual checks. HIGHLIGHTLY_DAILY_CAP overrides. */
export const DEFAULT_DAILY_CAP = 90

export function dailyCap(env = process.env.HIGHLIGHTLY_DAILY_CAP): number {
  const n = Number(env)
  return Number.isInteger(n) && n >= 0 && n <= UPSTREAM_DAILY_LIMIT ? n : DEFAULT_DAILY_CAP
}

export function isHighlightlyConfigured(): boolean {
  return Boolean(process.env.HIGHLIGHTLY_API_KEY?.trim())
}

export class HighlightlyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message)
    this.name = 'HighlightlyError'
  }
}

/** Thrown instead of making a request once the day's budget is spent. */
export class BudgetExhaustedError extends HighlightlyError {
  constructor(path: string) {
    super('Highlightly daily budget exhausted', 0, path)
    this.name = 'BudgetExhaustedError'
  }
}

/* ------------------------------------------------------------------ *
 * Budget
 * ------------------------------------------------------------------ */

/** The UTC day a request counts against. */
export function budgetDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function budgetResource(now: Date): string {
  return `highlightly:budget:${budgetDay(now)}`
}

export interface BudgetStore {
  /** Atomically takes one unit if fewer than `cap` are used. False = refuse. */
  reserve(now: Date, cap: number): Promise<boolean>
  /** Raises the day's count to what upstream reports it has seen. */
  observe(now: Date, usedUpstream: number): Promise<void>
  used(now: Date): Promise<number>
}

/**
 * Budget in sync_state: one row per UTC day, `rows_written` = units used.
 * The reservation is a single conditional upsert, so two instances cannot
 * both take the last unit.
 */
export const dbBudget: BudgetStore = {
  async reserve(now, cap) {
    if (cap <= 0) return false
    const resource = budgetResource(now)
    const rows = rowsOf(
      await getDb().execute(sql`
        insert into sync_state (resource, last_attempt_at, last_success_at, rows_written)
        values (${resource}, now(), now(), 1)
        on conflict (resource) do update
          set rows_written = sync_state.rows_written + 1, last_attempt_at = now()
          where sync_state.rows_written < ${cap}
        returning rows_written`)
    )
    return rows.length > 0
  },
  async observe(now, usedUpstream) {
    const resource = budgetResource(now)
    await getDb().execute(sql`
      update sync_state set rows_written = greatest(rows_written, ${usedUpstream})
      where resource = ${resource}`)
  },
  async used(now) {
    const row = rowsOf(
      await getDb().execute(sql`
        select rows_written as "used" from sync_state where resource = ${budgetResource(now)}`)
    )[0]
    return Number(row?.used ?? 0)
  },
}

/** In-memory budget for dry runs and tests: nothing is written anywhere. */
export function memoryBudget(initialUsed = 0): BudgetStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>()
  const key = (now: Date) => budgetDay(now)
  return {
    counts,
    async reserve(now, cap) {
      const used = counts.get(key(now)) ?? initialUsed
      if (used >= cap) return false
      counts.set(key(now), used + 1)
      return true
    },
    async observe(now, usedUpstream) {
      counts.set(key(now), Math.max(counts.get(key(now)) ?? initialUsed, usedUpstream))
    },
    async used(now) {
      return counts.get(key(now)) ?? initialUsed
    },
  }
}

/* ------------------------------------------------------------------ *
 * Client
 * ------------------------------------------------------------------ */

export interface ClientOptions {
  budget?: BudgetStore
  cap?: number
  apiKey?: string
  fetchImpl?: typeof fetch
  now?: () => Date
}

export interface HighlightlyClient {
  listMatches(params: { date: string; leagueId: number }): Promise<HlListMatch[]>
  matchDetail(id: number): Promise<HlDetail>
  lineups(id: number): Promise<HlLineups>
  /** Units left today under our cap. */
  remaining(): Promise<number>
  /** Requests this client actually sent. */
  readonly requests: number
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function createHighlightlyClient(options: ClientOptions = {}): HighlightlyClient {
  const budget = options.budget ?? dbBudget
  const cap = options.cap ?? dailyCap()
  const doFetch = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())
  let requests = 0

  async function get(path: string): Promise<unknown> {
    const key = (options.apiKey ?? process.env.HIGHLIGHTLY_API_KEY ?? '').trim()
    if (!key) throw new HighlightlyError('HIGHLIGHTLY_API_KEY is not set', 0, path)

    const at = now()
    if (!(await budget.reserve(at, cap))) throw new BudgetExhaustedError(path)
    requests++

    let res: Response
    try {
      res = await doFetch(`${HIGHLIGHTLY_BASE}${path}`, {
        headers: { 'x-rapidapi-key': key, 'User-Agent': USER_AGENT, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      throw new HighlightlyError(
        `Highlightly unreachable: ${err instanceof Error ? err.name : 'error'}`,
        0,
        path
      )
    }

    const remainingHeader = Number(res.headers.get('x-ratelimit-requests-remaining'))
    const limitHeader = Number(res.headers.get('x-ratelimit-requests-limit')) || UPSTREAM_DAILY_LIMIT
    if (res.headers.has('x-ratelimit-requests-remaining') && Number.isFinite(remainingHeader)) {
      await budget.observe(at, Math.max(0, limitHeader - remainingHeader))
    }
    // Upstream says the day is spent: stop asking until the reset.
    if (res.status === 429) await budget.observe(at, UPSTREAM_DAILY_LIMIT)
    if (!res.ok) throw new HighlightlyError(`Highlightly answered ${res.status}`, res.status, path)
    return res.json()
  }

  return {
    get requests() {
      return requests
    },
    async listMatches({ date, leagueId }) {
      if (!DATE_RE.test(date) || !Number.isInteger(leagueId) || leagueId <= 0) {
        throw new HighlightlyError('Invalid list parameters', 0, '/matches')
      }
      const q = new URLSearchParams({ date, leagueId: String(leagueId), limit: '100' })
      return parseMatchList(await get(`/matches?${q}`)).matches
    },
    async matchDetail(id) {
      if (!Number.isInteger(id) || id <= 0) throw new HighlightlyError('Invalid match id', 0, '/matches')
      return parseMatchDetail(await get(`/matches/${id}`))
    },
    async lineups(id) {
      if (!Number.isInteger(id) || id <= 0) throw new HighlightlyError('Invalid match id', 0, '/lineups')
      return parseLineups(await get(`/lineups/${id}`))
    },
    async remaining() {
      return Math.max(0, cap - (await budget.used(now())))
    },
  }
}
