import { promises as fs } from 'fs'
import path from 'path'
import { createHash } from 'crypto'

/**
 * Two-layer stale-while-revalidate cache (memory + disk).
 *
 * This is what makes a 10-requests-per-minute upstream quota usable: user
 * requests are served from cache, and only a background revalidation ever
 * touches the provider. It mirrors the CDN strategy FotMob serves its own
 * pages with (`stale-while-revalidate` + `stale-if-error`).
 *
 * Layers:
 *  1. in-memory Map — fast, per-process, lost on restart
 *  2. JSON files under `data/cache/` — survives restarts and dev reloads
 *
 * The disk layer is best-effort: on a read-only filesystem (Vercel lambdas)
 * every write fails harmlessly and the memory layer still does its job.
 */

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache')

export interface CachePolicy {
  /** Served directly while younger than this. */
  freshMs: number
  /** Served stale (with a background refresh) while younger than this. */
  staleMs: number
}

/**
 * Either a fixed policy, or one derived from the value already cached.
 *
 * The derived form lets a caller say "a finished match never goes stale, but
 * a live one is stale after 30s" — which keeps background revalidations off
 * the quota for data that can no longer change.
 */
export type PolicyInput<T> = CachePolicy | ((current: T | undefined) => CachePolicy)

export interface CacheResult<T> {
  value: T
  /** True when the value was past `freshMs` and a refresh was triggered. */
  stale: boolean
  /** Epoch ms the value was fetched. */
  storedAt: number
}

interface Entry<T> {
  value: T
  storedAt: number
}

const memory = new Map<string, Entry<unknown>>()
/** Dedupes concurrent loads of the same key into a single upstream call. */
const inFlight = new Map<string, Promise<unknown>>()

function fileFor(key: string): string {
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16)
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
  return path.join(CACHE_DIR, `${safe}.${hash}.json`)
}

async function readDisk<T>(key: string): Promise<Entry<T> | null> {
  try {
    const raw = await fs.readFile(fileFor(key), 'utf-8')
    const parsed = JSON.parse(raw) as Entry<T>
    if (typeof parsed?.storedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

async function writeDisk<T>(key: string, entry: Entry<T>): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    await fs.writeFile(fileFor(key), JSON.stringify(entry), 'utf-8')
  } catch {
    // Read-only filesystem (serverless) — memory layer is enough.
  }
}

async function load<T>(key: string): Promise<Entry<T> | null> {
  const hit = memory.get(key) as Entry<T> | undefined
  if (hit) return hit

  const onDisk = await readDisk<T>(key)
  if (onDisk) memory.set(key, onDisk as Entry<unknown>)
  return onDisk
}

async function store<T>(key: string, value: T): Promise<Entry<T>> {
  const entry: Entry<T> = { value, storedAt: Date.now() }
  memory.set(key, entry as Entry<unknown>)
  await writeDisk(key, entry)
  return entry
}

/** Runs `loader` once per key even if called concurrently. */
function dedupe<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined
  if (running) return running

  const p = loader()
    .then(async (value) => {
      await store(key, value)
      return value
    })
    .finally(() => inFlight.delete(key))

  inFlight.set(key, p)
  return p
}

/**
 * Returns a cached value, refreshing it through `loader` when needed.
 *
 * - fresh            -> returned immediately
 * - stale            -> returned immediately, refreshed in the background
 * - missing/expired  -> awaits `loader`
 * - loader throws    -> falls back to any stale value rather than failing
 */
export async function cached<T>(
  key: string,
  policyInput: PolicyInput<T>,
  loader: () => Promise<T>
): Promise<CacheResult<T>> {
  const entry = await load<T>(key)
  const policy = typeof policyInput === 'function' ? policyInput(entry?.value) : policyInput
  const age = entry ? Date.now() - entry.storedAt : Infinity

  if (entry && age < policy.freshMs) {
    return { value: entry.value, stale: false, storedAt: entry.storedAt }
  }

  if (entry && age < policy.staleMs) {
    // Serve stale now, refresh for the next caller. Errors are ignored on
    // purpose: the cached value is still perfectly serveable.
    void dedupe(key, loader).catch(() => undefined)
    return { value: entry.value, stale: true, storedAt: entry.storedAt }
  }

  try {
    const value = await dedupe(key, loader)
    return { value, stale: false, storedAt: Date.now() }
  } catch (err) {
    if (entry) {
      // stale-if-error: better an old table than an error page.
      return { value: entry.value, stale: true, storedAt: entry.storedAt }
    }
    throw err
  }
}

/** Drops a key from both layers. Used by tests and the admin tools. */
export async function invalidate(key: string): Promise<void> {
  memory.delete(key)
  inFlight.delete(key)
  try {
    await fs.unlink(fileFor(key))
  } catch {
    // not on disk — nothing to do
  }
}

/** Clears the in-memory layer only. Test helper. */
export function clearMemoryCache(): void {
  memory.clear()
  inFlight.clear()
}
