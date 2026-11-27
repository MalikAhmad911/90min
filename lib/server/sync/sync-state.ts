import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

/**
 * sync_state helpers shared by the providers that run outside the
 * football-data limit (OpenLigaDB, Highlightly).
 *
 * Three uses of the one table:
 *   - bookkeeping for a resource ('events:BL1'), read by the admin page;
 *   - markers: a timestamp plus a small integer, e.g. "season last fetched
 *     at T" or "requests spent today";
 *   - request slots: a compare-and-set on last_attempt_at, so every
 *     serverless instance together makes at most one pass per interval.
 *
 * The schema is not ours to change, so markers reuse the existing columns:
 * `last_success_at` holds the time and `rows_written` the integer.
 */

export type Row = Record<string, unknown>

/** The neon-http driver returns `{ rows }`; other drivers return the array itself. */
export function rowsOf(result: unknown): Row[] {
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[]
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Driver errors carry the useful part on `cause` and the whole SQL in the message. */
export function describeError(err: unknown): string {
  const cause = (err as { cause?: unknown })?.cause
  if (cause instanceof Error && cause.message) return cause.message
  if (err instanceof Error) return err.message.split('\nparams:')[0].slice(0, 300)
  return String(err)
}

/** Postgres SQLSTATE of a driver error, looking through drizzle's wrapper. */
export function pgErrorCode(err: unknown): string | null {
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
  }
  return null
}

/** True when a query failed because a table does not exist (yet). */
export function isUndefinedTable(err: unknown): boolean {
  if (pgErrorCode(err) === '42P01') return true
  return /relation "[^"]+" does not exist/.test(describeError(err))
}

/** Bookkeeping for a resource, mirroring ingest's run() so the admin page reads it like any other. */
export async function recordState(
  resource: string,
  outcome: { kind: 'attempt' } | { kind: 'success'; rows: number } | { kind: 'failure'; error: string }
): Promise<void> {
  const db = getDb()
  if (outcome.kind === 'attempt') {
    await db.execute(sql`
      insert into sync_state (resource, last_attempt_at) values (${resource}, now())
      on conflict (resource) do update set last_attempt_at = now()`)
  } else if (outcome.kind === 'success') {
    await db.execute(sql`
      insert into sync_state (resource, last_attempt_at, last_success_at, rows_written, consecutive_failures)
      values (${resource}, now(), now(), ${outcome.rows}, 0)
      on conflict (resource) do update set
        last_attempt_at = now(), last_success_at = now(), rows_written = excluded.rows_written,
        last_error = null, consecutive_failures = 0`)
  } else {
    await db.execute(sql`
      insert into sync_state (resource, last_attempt_at, last_error, consecutive_failures)
      values (${resource}, now(), ${outcome.error.slice(0, 500)}, 1)
      on conflict (resource) do update set
        last_attempt_at = now(), last_error = excluded.last_error,
        consecutive_failures = sync_state.consecutive_failures + 1`)
  }
}

/** Reads a marker row: when it last succeeded and the integer it carries. */
export async function readMarker(resource: string): Promise<{ at: Date | null; value: number } | null> {
  const row = rowsOf(
    await getDb().execute(sql`
      select last_success_at as "at", rows_written as "value" from sync_state where resource = ${resource}`)
  )[0]
  if (!row) return null
  return { at: row.at ? new Date(row.at as string) : null, value: Number(row.value ?? 0) }
}

/** Writes a marker row (see the module comment for the column reuse). */
export async function writeMarker(resource: string, at: Date, value: number, note: string | null = null) {
  await getDb().execute(sql`
    insert into sync_state (resource, last_attempt_at, last_success_at, rows_written, last_error, consecutive_failures)
    values (${resource}, now(), ${at.toISOString()}::timestamptz, ${value}, ${note}, 0)
    on conflict (resource) do update set
      last_attempt_at = now(), last_success_at = excluded.last_success_at,
      rows_written = excluded.rows_written, last_error = excluded.last_error`)
}

/* ------------------------------------------------------------------ *
 * Request slots
 * ------------------------------------------------------------------ */

export interface SlotState {
  lastAttemptAt: Date | null
  consecutiveFailures: number
}

/**
 * Whether a pass may run now. Each consecutive failure doubles the wait,
 * capped at `maxBackoffMs`, so a struggling upstream is left alone rather
 * than hammered by every instance that wakes up.
 */
export function slotDecision(
  state: SlotState | null,
  now: number,
  minIntervalMs: number,
  maxBackoffMs = 60 * 60_000
): { allowed: boolean; waitMs: number } {
  if (!state?.lastAttemptAt) return { allowed: true, waitMs: 0 }
  const failures = Math.max(0, Math.min(state.consecutiveFailures, 16))
  const interval = Math.min(minIntervalMs * 2 ** failures, Math.max(maxBackoffMs, minIntervalMs))
  const elapsed = now - state.lastAttemptAt.getTime()
  return elapsed >= interval ? { allowed: true, waitMs: 0 } : { allowed: false, waitMs: interval - elapsed }
}

/**
 * Claims a request slot. Compare-and-set on `sync_state.last_attempt_at`:
 * read the row, decide in JS (so `slotDecision` is the single, tested rule),
 * then update only if nobody else moved the timestamp meanwhile. Two
 * instances racing therefore cannot both win. The timestamp is written from
 * JS at millisecond precision so the comparison round-trips exactly.
 */
export async function claimSlot(
  resource: string,
  now: Date,
  minIntervalMs: number,
  maxBackoffMs?: number
): Promise<{ claimed: boolean; waitMs: number }> {
  const db = getDb()
  const current = rowsOf(
    await db.execute(sql`
      select last_attempt_at as "lastAttemptAt", consecutive_failures as "consecutiveFailures"
      from sync_state where resource = ${resource}`)
  )[0]

  const state: SlotState | null = current
    ? {
        lastAttemptAt: current.lastAttemptAt ? new Date(current.lastAttemptAt as string) : null,
        consecutiveFailures: Number(current.consecutiveFailures ?? 0),
      }
    : null

  const decision = slotDecision(state, now.getTime(), minIntervalMs, maxBackoffMs)
  if (!decision.allowed) return { claimed: false, waitMs: decision.waitMs }

  const stamp = now.toISOString()
  const won = current
    ? rowsOf(
        await db.execute(sql`
          update sync_state set last_attempt_at = ${stamp}::timestamptz
          where resource = ${resource}
            and last_attempt_at is not distinct from ${state?.lastAttemptAt?.toISOString() ?? null}::timestamptz
          returning resource`)
      )
    : rowsOf(
        await db.execute(sql`
          insert into sync_state (resource, last_attempt_at) values (${resource}, ${stamp}::timestamptz)
          on conflict (resource) do nothing
          returning resource`)
      )
  return won.length > 0 ? { claimed: true, waitMs: 0 } : { claimed: false, waitMs: minIntervalMs }
}

/** Records how the pass that held the slot went; failures widen the next interval. */
export async function releaseSlot(
  resource: string,
  outcome: { ok: true } | { ok: false; error: string }
): Promise<void> {
  const db = getDb()
  if (outcome.ok) {
    await db.execute(sql`
      update sync_state
      set last_success_at = now(), consecutive_failures = 0, last_error = null
      where resource = ${resource}`)
  } else {
    await db.execute(sql`
      update sync_state
      set consecutive_failures = consecutive_failures + 1, last_error = ${outcome.error.slice(0, 500)}
      where resource = ${resource}`)
  }
}
