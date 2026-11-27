import { inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { matches } from '@/lib/db/schema'
import type { Match } from '@/lib/types'
import { diffMatch, type MatchState, type SignalPayload } from './differ'
import type { SignalType } from './prefs'

/**
 * Turns a sync's freshly fetched matches into stored `match_signals`.
 *
 * Call it BEFORE the matches upsert: the stored row is the "previous" state,
 * and once the upsert has run it is gone.
 */

/**
 * Signals are only recorded for matches that kicked off at most this long ago
 * (or have not kicked off yet). A season sync can carry a match we last saw
 * days ago as TIMED and now see as FINISHED; announcing that would be a stale
 * push, and on a first ingest it would be hundreds of them. Six hours covers
 * a delayed kick-off plus extra time and penalties with room to spare.
 */
export const SIGNAL_MAX_AGE_MS = 6 * 60 * 60 * 1000

export interface StoredState extends MatchState {
  id: number
}

/** The newest signal already recorded for a match: its seq and the state it left the match in. */
export interface LatestSignal {
  seq: number
  state: MatchState | null
}

export interface PlannedSignal {
  matchId: number
  seq: number
  /** The first seq this run claims for the match; see the insert guard below. */
  baseSeq: number
  type: SignalType
  payload: SignalPayload
}

export function incomingState(m: Match): MatchState {
  return {
    status: m.status,
    home: m.score?.fullTime?.home ?? null,
    away: m.score?.fullTime?.away ?? null,
  }
}

function sameState(a: MatchState | null, b: MatchState): boolean {
  return !!a && a.status === b.status && a.home === b.home && a.away === b.away
}

/**
 * Pure planning step: which signals to insert, with which seq numbers.
 *
 * - A match with no stored row is being seen for the first time and emits
 *   nothing: there is no "before" to compare with.
 * - A match whose newest recorded signal already left it in exactly the
 *   incoming state emits nothing. That closes the window between a run
 *   inserting its signals and upserting the match row, during which a second
 *   run would still read the old row and compute the same change again.
 */
export function planSignals(
  incoming: Match[],
  stored: Map<number, StoredState>,
  latest: Map<number, LatestSignal>,
  now: Date
): PlannedSignal[] {
  // The same match can appear twice in one payload; the last copy wins, as it
  // does in the upsert.
  const byId = new Map<number, Match>()
  for (const m of incoming) if (Number.isInteger(m?.id)) byId.set(m.id, m)

  const out: PlannedSignal[] = []
  for (const m of byId.values()) {
    const prev = stored.get(m.id)
    if (!prev) continue

    const kickoff = Date.parse(m.utcDate)
    if (!Number.isFinite(kickoff) || now.getTime() - kickoff > SIGNAL_MAX_AGE_MS) continue

    const next = incomingState(m)
    const diff = diffMatch(prev, next)
    if (diff.length === 0) continue

    const last = latest.get(m.id)
    if (last && sameState(last.state, next)) continue

    const baseSeq = (last?.seq ?? 0) + 1
    diff.forEach((s, i) =>
      out.push({ matchId: m.id, seq: baseSeq + i, baseSeq, type: s.type, payload: s.payload })
    )
  }
  return out
}

export interface RecordSignalsResult {
  ok: boolean
  /** Signals actually inserted by this call. */
  recorded: { id: number; matchId: number; seq: number; type: string }[]
  error?: string
}

const CHUNK = 500

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function stateFromPayload(payload: unknown): MatchState | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.status !== 'string') return null
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  return { status: p.status, home: num(p.home), away: num(p.away) }
}

/**
 * Diffs `incoming` against the stored rows and records the resulting signals.
 *
 * Concurrency: two syncs can race. Each insert is guarded twice - the
 * UNIQUE(match_id, seq) index turns an identical second insert into a no-op
 * (ON CONFLICT DO NOTHING), and the NOT EXISTS clause refuses a run's rows
 * for a match once any row at or past that run's first seq exists, so a race
 * cannot interleave half of one run's signals with half of another's.
 *
 * Never throws: notifications are a side channel, and a failure here must not
 * abort the ingestion that called it. The error is returned and logged.
 */
export async function recordSignals(
  incoming: Match[],
  options: { now?: Date } = {}
): Promise<RecordSignalsResult> {
  const now = options.now ?? new Date()
  try {
    const ids = [...new Set(incoming.map((m) => m?.id).filter((id) => Number.isInteger(id)))]
    if (ids.length === 0) return { ok: true, recorded: [] }

    const db = getDb()
    const stored = new Map<number, StoredState>()
    for (const part of chunk(ids, CHUNK)) {
      const rows = await db
        .select({
          id: matches.id,
          status: matches.status,
          home: matches.homeScoreFt,
          away: matches.awayScoreFt,
        })
        .from(matches)
        .where(inArray(matches.id, part))
      for (const r of rows) stored.set(r.id, r)
    }

    // Only matches that actually changed need their latest signal looked up.
    const changed = incoming
      .filter((m) => {
        const prev = stored.get(m.id)
        return prev && diffMatch(prev, incomingState(m)).length > 0
      })
      .map((m) => m.id)
    if (changed.length === 0) return { ok: true, recorded: [] }

    const latest = new Map<number, LatestSignal>()
    for (const part of chunk([...new Set(changed)], CHUNK)) {
      const res = await db.execute(sql`
        SELECT DISTINCT ON (match_id) match_id, seq, payload
        FROM match_signals
        WHERE match_id IN (${sql.join(
          part.map((id) => sql`${id}`),
          sql`, `
        )})
        ORDER BY match_id, seq DESC
      `)
      for (const r of res.rows as { match_id: number; seq: number; payload: unknown }[]) {
        latest.set(Number(r.match_id), { seq: Number(r.seq), state: stateFromPayload(r.payload) })
      }
    }

    const planned = planSignals(incoming, stored, latest, now)
    if (planned.length === 0) return { ok: true, recorded: [] }

    const recorded: RecordSignalsResult['recorded'] = []
    for (const part of chunk(planned, CHUNK)) {
      const values = sql.join(
        part.map(
          (p) =>
            sql`(${p.matchId}::int, ${p.seq}::int, ${p.baseSeq}::int, ${p.type}::text, ${JSON.stringify(
              p.payload
            )}::jsonb)`
        ),
        sql`, `
      )
      const res = await db.execute(sql`
        INSERT INTO match_signals (match_id, seq, type, payload)
        SELECT v.match_id, v.seq, v.type, v.payload
        FROM (VALUES ${values}) AS v(match_id, seq, base_seq, type, payload)
        WHERE NOT EXISTS (
          SELECT 1 FROM match_signals s
          WHERE s.match_id = v.match_id AND s.seq >= v.base_seq
        )
        ON CONFLICT (match_id, seq) DO NOTHING
        RETURNING id, match_id, seq, type
      `)
      for (const r of res.rows as { id: number; match_id: number; seq: number; type: string }[]) {
        recorded.push({ id: Number(r.id), matchId: Number(r.match_id), seq: Number(r.seq), type: r.type })
      }
    }
    return { ok: true, recorded }
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\nparams:')[0].slice(0, 300) : String(err)
    console.warn('[notify] recordSignals failed:', message)
    return { ok: false, recorded: [], error: message }
  }
}
