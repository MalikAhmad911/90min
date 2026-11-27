import type { SignalType } from './prefs'

/**
 * The event differ (PRD section 9): compares a match's stored state with the
 * state a sync just fetched and names what happened in between.
 *
 * Pure and synchronous so every transition can be unit-tested without a
 * database; `recordSignals` (signals.ts) is the part that touches storage.
 *
 * Decisions worth knowing:
 *
 * - Multi-goal jumps. When one side's score rises by two or more between two
 *   syncs, the differ emits ONE GOAL signal for that side carrying `delta`
 *   (e.g. 2), not one signal per goal. We do not know the order or timing of
 *   goals that fell between two polls, so inventing intermediate scorelines
 *   would be fiction; and the pushes share a per-match collapse topic, so a
 *   second push would only replace the first on the lock screen anyway. When
 *   both sides scored between polls, there is one GOAL per side (home first),
 *   each carrying the final score.
 * - Corrections. A side's score going down is a SCORE_CORRECTION (a goal
 *   disallowed by VAR, or a provider fixing its data), PRD NT-3.
 * - Catch-up. A match that jumps straight from not-started to FINISHED (we
 *   missed it entirely) yields FULL_TIME only: goal alerts hours after the
 *   fact are noise.
 * - Unknown scores. A null in the NEW state means "the provider did not say",
 *   not zero, so it never produces a correction. A null in the OLD state of a
 *   match that has started counts as zero.
 * - PAUSED -> IN_PLAY is reported as SECOND_HALF. football-data also uses
 *   PAUSED for the break before extra time, so the message text stays neutral
 *   ("Play resumes") about which half it is.
 */

export interface MatchState {
  status: string
  home: number | null
  away: number | null
}

export interface SignalPayload {
  /** State after the change. */
  status: string
  home: number | null
  away: number | null
  /** State before the change. */
  prevStatus: string
  prevHome: number | null
  prevAway: number | null
  /** For GOAL / SCORE_CORRECTION: which side's score moved, and by how much. */
  side?: 'home' | 'away'
  delta?: number
}

export interface DiffSignal {
  type: SignalType
  payload: SignalPayload
}

const NOT_STARTED = new Set(['SCHEDULED', 'TIMED', 'POSTPONED'])
const LIVE = new Set(['IN_PLAY', 'PAUSED'])
const SCORE_BEARING = new Set(['IN_PLAY', 'PAUSED', 'FINISHED'])

function sameState(a: MatchState, b: MatchState): boolean {
  return a.status === b.status && a.home === b.home && a.away === b.away
}

/** Whether a score change between these two states is a real event. */
function scoresComparable(prev: MatchState, next: MatchState): boolean {
  if (!SCORE_BEARING.has(next.status)) return false
  if (SCORE_BEARING.has(prev.status)) return true
  // Not started -> live: a goal scored before our first live poll is still news.
  // Not started -> FINISHED is catch-up and deliberately excluded.
  return NOT_STARTED.has(prev.status) && LIVE.has(next.status)
}

export function diffMatch(prev: MatchState, next: MatchState): DiffSignal[] {
  if (sameState(prev, next)) return []

  const base: SignalPayload = {
    status: next.status,
    home: next.home,
    away: next.away,
    prevStatus: prev.status,
    prevHome: prev.home,
    prevAway: prev.away,
  }
  const out: DiffSignal[] = []
  const emit = (type: SignalType, extra: Partial<SignalPayload> = {}) =>
    out.push({ type, payload: { ...base, ...extra } })

  const statusChanged = prev.status !== next.status

  // Order matters: it is the order the pushes go out in, so the match starts
  // before anyone scores and goals land before the final whistle.
  if (statusChanged && NOT_STARTED.has(prev.status) && next.status === 'IN_PLAY') {
    emit('KICKOFF')
  }
  if (statusChanged && prev.status === 'PAUSED' && next.status === 'IN_PLAY') {
    emit('SECOND_HALF')
  }

  if (scoresComparable(prev, next)) {
    for (const side of ['home', 'away'] as const) {
      const after = next[side]
      if (after == null) continue
      const before = prev[side] ?? 0
      const delta = after - before
      if (delta > 0) emit('GOAL', { side, delta })
      else if (delta < 0) emit('SCORE_CORRECTION', { side, delta })
    }
  }

  if (statusChanged) {
    if (next.status === 'PAUSED') emit('HALF_TIME')
    else if (next.status === 'FINISHED') emit('FULL_TIME')
    else if (next.status === 'POSTPONED') emit('POSTPONED')
    else if (next.status === 'CANCELLED') emit('CANCELLED')
  }

  return out
}
