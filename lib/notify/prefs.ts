import type { SIGNAL_TYPES } from '@/lib/db/schema'

/**
 * Per-follow alert toggles (PRD NT-1) and how differ signals map onto them.
 *
 * Client-safe: no database or Node imports, so the settings UI can share the
 * exact key list the API validates against. `SIGNAL_TYPES` is imported as a
 * type only, which keeps drizzle out of the browser bundle.
 */

export type SignalType = (typeof SIGNAL_TYPES)[number]

/** Every toggle a follow can carry, in display order. */
export const NOTIFY_KEYS = [
  'goals',
  'kickoff',
  'halfTime',
  'fullTime',
  'redCards',
  'lineups',
] as const

export type NotifyKey = (typeof NOTIFY_KEYS)[number]
export type NotifyPrefs = Record<NotifyKey, boolean>

/**
 * Toggles the data provider cannot drive yet. The free football-data tier
 * sends no bookings or lineups, so these are stored (the schema is ready for
 * a richer provider) but the UI labels them "not available yet" instead of
 * offering a switch that would never fire.
 */
export const UNAVAILABLE_NOTIFY_KEYS: readonly NotifyKey[] = ['redCards', 'lineups']

export const NOTIFY_LABELS: Record<NotifyKey, string> = {
  goals: 'Goals',
  kickoff: 'Kick-off',
  halfTime: 'Half-time',
  fullTime: 'Full-time',
  redCards: 'Red cards',
  lineups: 'Lineups',
}

/** Entity kinds a follow can have (mirrors FOLLOWABLE in the schema). */
export type FollowEntityType = 'team' | 'competition' | 'match' | 'player'

const ALL_OFF: NotifyPrefs = {
  goals: false,
  kickoff: false,
  halfTime: false,
  fullTime: false,
  redCards: false,
  lineups: false,
}

/**
 * Defaults for a follow whose `notify` object does not mention a key.
 *
 * Teams and single matches are what people follow in order to be alerted, so
 * the main moments default on. A competition is different: following the
 * Premier League and getting a push for every goal in ten simultaneous
 * matches is a flood nobody asked for, so competition alerts are opt-in.
 * Players default off because no signal can name a scorer yet.
 */
export function defaultPrefs(entityType: FollowEntityType): NotifyPrefs {
  if (entityType === 'team' || entityType === 'match') {
    return { ...ALL_OFF, goals: true, kickoff: true, fullTime: true, redCards: true }
  }
  return { ...ALL_OFF }
}

/**
 * The stored jsonb merged over the defaults. Anything that is not a known key
 * holding a boolean is ignored, so a malformed row can never switch an alert
 * on by accident.
 */
export function resolvePrefs(entityType: FollowEntityType, stored: unknown): NotifyPrefs {
  const prefs = defaultPrefs(entityType)
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const record = stored as Record<string, unknown>
    for (const key of NOTIFY_KEYS) {
      if (typeof record[key] === 'boolean') prefs[key] = record[key] as boolean
    }
  }
  return prefs
}

/**
 * Which toggle governs a signal.
 *
 * - SCORE_CORRECTION rides on `goals`: whoever was told about a goal must be
 *   told when it is taken back (NT-3).
 * - SECOND_HALF rides on `halfTime`: both ends of the break are one setting.
 * - POSTPONED / CANCELLED ride on `kickoff`: they are news about whether the
 *   kick-off happens at all.
 */
export const SIGNAL_PREF: Record<SignalType, NotifyKey> = {
  KICKOFF: 'kickoff',
  GOAL: 'goals',
  SCORE_CORRECTION: 'goals',
  HALF_TIME: 'halfTime',
  SECOND_HALF: 'halfTime',
  FULL_TIME: 'fullTime',
  POSTPONED: 'kickoff',
  CANCELLED: 'kickoff',
}

export function prefForSignal(type: SignalType): NotifyKey {
  return SIGNAL_PREF[type]
}
