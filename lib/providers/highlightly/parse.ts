import { z } from 'zod'
import type {
  LineupEntry,
  MatchLineupsData,
  MatchStatKey,
  MatchStatLine,
  TeamLineupData,
  TimelineEventType,
} from '@/lib/types'

/**
 * Highlightly payloads: validation and normalisation. Pure, so it is tested
 * against saved real responses (__tests__/fixtures/highlightly).
 *
 * Only the fields we use are declared; zod drops the rest (news, predictions,
 * logos, forecast...). Nothing raw is stored or served - everything leaves
 * this module in our own shape.
 */

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

const teamRef = z.object({ id: z.number().int(), name: z.string() })

const stateSchema = z.object({
  clock: z.number().nullish(),
  score: z
    .object({ current: z.string().nullish(), penalties: z.string().nullish() })
    .nullish(),
  description: z.string().nullish(),
})

export const listMatchSchema = z.object({
  id: z.number().int(),
  date: z.string(),
  round: z.string().nullish(),
  state: stateSchema.nullish(),
  homeTeam: teamRef,
  awayTeam: teamRef,
  league: z.object({ id: z.number().int(), name: z.string().nullish(), season: z.number().nullish() }),
})

const eventSchema = z.object({
  team: teamRef.nullish(),
  time: z.union([z.string(), z.number()]).nullish(),
  type: z.string(),
  player: z.string().nullish(),
  playerId: z.number().nullish(),
  assist: z.string().nullish(),
  assistingPlayerId: z.number().nullish(),
  substituted: z.string().nullish(),
})

const statBlockSchema = z.object({
  team: teamRef,
  statistics: z.array(
    z.object({ displayName: z.string(), value: z.union([z.number(), z.string()]).nullish() })
  ),
})

export const detailSchema = listMatchSchema.extend({
  venue: z
    .object({ name: z.string().nullish(), city: z.string().nullish() })
    .nullish(),
  referee: z.object({ name: z.string().nullish() }).nullish(),
  events: z.array(eventSchema).nullish(),
  statistics: z.array(statBlockSchema).nullish(),
})

const lineupPlayer = z.object({
  name: z.string(),
  number: z.number().int().nullish(),
  position: z.string().nullish(),
})

const teamLineupSchema = z.object({
  id: z.number().int().nullish(),
  name: z.string().nullish(),
  formation: z.string().nullish(),
  initialLineup: z.array(z.array(lineupPlayer)).nullish(),
  substitutes: z.array(lineupPlayer).nullish(),
})

export const lineupsSchema = z.object({
  homeTeam: teamLineupSchema.nullish(),
  awayTeam: teamLineupSchema.nullish(),
})

export type HlListMatch = z.infer<typeof listMatchSchema>
export type HlDetail = z.infer<typeof detailSchema>
export type HlEvent = z.infer<typeof eventSchema>
export type HlLineups = z.infer<typeof lineupsSchema>

export class HighlightlyParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HighlightlyParseError'
  }
}

/** A /matches list. One malformed item does not cost the rest. */
export function parseMatchList(payload: unknown): { matches: HlListMatch[]; invalid: number; total: number | null } {
  const data = (payload as { data?: unknown })?.data
  if (!Array.isArray(data)) throw new HighlightlyParseError('Expected { data: [] }')
  const matches: HlListMatch[] = []
  let invalid = 0
  for (const item of data) {
    const parsed = listMatchSchema.safeParse(item)
    if (parsed.success) matches.push(parsed.data)
    else invalid++
  }
  const total = (payload as { pagination?: { totalCount?: unknown } }).pagination?.totalCount
  return { matches, invalid, total: typeof total === 'number' ? total : null }
}

/** /matches/{id} answers with a one-element array (an object is accepted too). */
export function parseMatchDetail(payload: unknown): HlDetail {
  const item = Array.isArray(payload) ? payload[0] : payload
  const parsed = detailSchema.safeParse(item)
  if (!parsed.success) throw new HighlightlyParseError(`Invalid match detail: ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

export function parseLineups(payload: unknown): HlLineups {
  const parsed = lineupsSchema.safeParse(payload)
  if (!parsed.success) throw new HighlightlyParseError(`Invalid lineups: ${parsed.error.issues[0]?.message}`)
  return parsed.data
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/** "Finished", "Finished after penalties", "Finished after extra time". */
export function isFinishedState(description: string | null | undefined): boolean {
  return /^finished/i.test(description?.trim() ?? '')
}

const LIVE_STATES = ['first half', 'second half', 'half time', 'extra time', 'break time', 'penalties', 'in progress']

export function isLiveState(description: string | null | undefined): boolean {
  return LIVE_STATES.includes(description?.trim().toLowerCase() ?? '')
}

/** "4 - 0" -> { home: 4, away: 0 }; null when absent or malformed. */
export function parseScore(current: string | null | undefined): { home: number; away: number } | null {
  const m = current?.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/)
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

/**
 * "8" -> 8; "90+3" -> 90 + 3 added; "45+2'" tolerated. Null when the value
 * is missing or outside what match_events accepts (0-150, +0-30).
 */
export function parseEventTime(time: string | number | null | undefined): {
  minute: number | null
  addedTime: number | null
} {
  if (time == null) return { minute: null, addedTime: null }
  const m = String(time).trim().match(/^(\d{1,3})\s*(?:\+\s*(\d{1,2}))?\s*['′]?$/)
  if (!m) return { minute: null, addedTime: null }
  const minute = Number(m[1])
  const added = m[2] === undefined ? null : Number(m[2])
  if (minute > 150) return { minute: null, addedTime: null }
  if (added !== null && added > 30) return { minute, addedTime: null }
  return { minute, addedTime: added === 0 ? null : added }
}

/** Upstream type -> ours. VAR outcomes keep their text in `detail`. Unknown types are dropped. */
export function mapEventType(type: string): TimelineEventType | null {
  const t = type.trim().toLowerCase()
  if (t === 'goal') return 'GOAL'
  if (t === 'own goal') return 'OWN_GOAL'
  if (t === 'penalty') return 'PENALTY_GOAL'
  if (t === 'missed penalty') return 'MISSED_PENALTY'
  if (t === 'yellow card') return 'YELLOW_CARD'
  if (t === 'red card') return 'RED_CARD'
  if (t === 'substitution') return 'SUBSTITUTION'
  if (t.startsWith('var')) return 'VAR'
  return null
}

export const GOAL_TYPES: readonly TimelineEventType[] = ['GOAL', 'OWN_GOAL', 'PENALTY_GOAL']

export interface PlannedEvent {
  providerEventId: string
  type: TimelineEventType
  minute: number | null
  addedTime: number | null
  /** Our team id: the side the event belongs to (for goals, the side credited). */
  teamId: number | null
  playerName: string | null
  relatedPlayerName: string | null
  scoreHome: number | null
  scoreAway: number | null
  detail: string | null
  isCancelled: boolean
}

export interface EventContext {
  /** Highlightly match id - prefixes every synthetic event id. */
  hlMatchId: number
  /** Highlightly ids of OUR home and away teams (upstream may list them the other way round). */
  hlHomeId: number
  hlAwayId: number
  homeTeamId: number
  awayTeamId: number
}

/**
 * Turns upstream events into match_events rows, in our home/away terms.
 *
 * Upstream events have no ids, so one is synthesised from the match, type,
 * player and time; repeats of the same key get a counter. A changed time
 * therefore reads as "old event gone, new one added" - the old row is marked
 * cancelled and hidden from the timeline (only cancelled GOALS are shown).
 *
 * Observed conventions (2026/27 PL, Chelsea 1-4 Leeds):
 *   - Substitution: `player` goes OFF, `substituted` comes ON;
 *   - "Penalty" is a scored penalty; the event team is the scoring side;
 *   - a second yellow arrives as "Red Card": it is labelled SECOND_YELLOW
 *     when the same player was booked earlier.
 * Own goals: the event team is taken to be the player's club, so the goal is
 * credited to the other side - unless that contradicts the final score and
 * the opposite reading agrees with it.
 */
export function planEventRows(
  events: HlEvent[],
  ctx: EventContext,
  /** Final or current score in OUR home/away order, used to orient own goals. */
  score: { home: number; away: number } | null
): PlannedEvent[] {
  const sideOf = (hlTeamId: number | undefined): 'home' | 'away' | null =>
    hlTeamId === ctx.hlHomeId ? 'home' : hlTeamId === ctx.hlAwayId ? 'away' : null
  const teamOf = (side: 'home' | 'away' | null) =>
    side === 'home' ? ctx.homeTeamId : side === 'away' ? ctx.awayTeamId : null
  const flip = (side: 'home' | 'away' | null) => (side === 'home' ? 'away' : side === 'away' ? 'home' : null)

  const usable = events
    .map((e, index) => ({ e, index, type: mapEventType(e.type), time: parseEventTime(e.time) }))
    .filter((x): x is typeof x & { type: TimelineEventType } => x.type !== null)
    .sort(
      (a, b) =>
        (a.time.minute ?? 0) - (b.time.minute ?? 0) ||
        (a.time.addedTime ?? 0) - (b.time.addedTime ?? 0) ||
        a.index - b.index
    )

  // Own-goal orientation, checked against the score when we have one.
  const tally = (ogToOpponent: boolean) => {
    let home = 0
    let away = 0
    for (const x of usable) {
      if (!GOAL_TYPES.includes(x.type)) continue
      let side = sideOf(x.e.team?.id)
      if (x.type === 'OWN_GOAL' && ogToOpponent) side = flip(side)
      if (side === 'home') home++
      else if (side === 'away') away++
    }
    return { home, away }
  }
  const agrees = (t: { home: number; away: number }) => !!score && t.home === score.home && t.away === score.away
  const ogToOpponent = agrees(tally(true)) || !agrees(tally(false))

  const seen = new Map<string, number>()
  const booked = new Set<string>()
  let home = 0
  let away = 0

  return usable.map(({ e, type: rawType, time }) => {
    let type = rawType
    const player = e.player?.trim() || null
    const playerKey = e.playerId != null ? String(e.playerId) : (player ?? '?')
    let side = sideOf(e.team?.id)

    if (type === 'YELLOW_CARD') booked.add(playerKey)
    if (type === 'RED_CARD' && booked.has(playerKey)) type = 'SECOND_YELLOW'
    if (type === 'OWN_GOAL' && ogToOpponent) side = flip(side)

    let scoreHome: number | null = null
    let scoreAway: number | null = null
    if (GOAL_TYPES.includes(type)) {
      if (side === 'home') home++
      else if (side === 'away') away++
      scoreHome = home
      scoreAway = away
    }

    const base = `${ctx.hlMatchId}:${type}:${playerKey}:${time.minute ?? 'x'}+${time.addedTime ?? 0}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)

    const isSub = type === 'SUBSTITUTION'
    return {
      providerEventId: n === 1 ? base : `${base}#${n}`,
      type,
      minute: time.minute,
      addedTime: time.addedTime,
      teamId: teamOf(side),
      // For a substitution our `player` is the one coming on.
      playerName: isSub ? e.substituted?.trim() || null : player,
      relatedPlayerName: isSub ? player : e.assist?.trim() || null,
      scoreHome,
      scoreAway,
      detail: type === 'VAR' ? e.type.trim().slice(0, 80) : null,
      isCancelled: false,
    }
  })
}

/**
 * Which stored events vanished upstream: ids present before, still live,
 * and absent now. Only ever applied to a match that was just refetched.
 */
export function vanishedEventIds(
  stored: { providerEventId: string; isCancelled: boolean }[],
  current: { providerEventId: string }[]
): string[] {
  const now = new Set(current.map((c) => c.providerEventId))
  return stored.filter((s) => !s.isCancelled && !now.has(s.providerEventId)).map((s) => s.providerEventId)
}

/* ------------------------------------------------------------------ *
 * Statistics
 * ------------------------------------------------------------------ */

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').trim())
  return Number.isFinite(n) ? n : null
}

/** Our stat, from upstream displayName(s). Fractions (0.57) become percentages. */
const STAT_SOURCES: { key: MatchStatKey; label: string; format: MatchStatLine['format']; names: string[] }[] = [
  { key: 'possession', label: 'Possession', format: 'percent', names: ['Possession', 'Ball possession'] },
  { key: 'xg', label: 'Expected goals (xG)', format: 'decimal', names: ['Expected Goals'] },
  { key: 'shots', label: 'Total shots', format: 'count', names: ['Total shots', 'Shots total'] },
  { key: 'shots_on_target', label: 'Shots on target', format: 'count', names: ['Shots on target'] },
  { key: 'shots_off_target', label: 'Shots off target', format: 'count', names: ['Shots off target'] },
  { key: 'blocked_shots', label: 'Blocked shots', format: 'count', names: ['Blocked shots'] },
  { key: 'big_chances', label: 'Big chances', format: 'count', names: ['Big Chances Created', 'Big chances'] },
  { key: 'corners', label: 'Corners', format: 'count', names: ['Corners', 'Corner kicks'] },
  { key: 'fouls', label: 'Fouls', format: 'count', names: ['Fouls'] },
  { key: 'offsides', label: 'Offsides', format: 'count', names: ['Offsides'] },
  { key: 'yellow_cards', label: 'Yellow cards', format: 'count', names: ['Yellow cards'] },
  { key: 'red_cards', label: 'Red cards', format: 'count', names: ['Red cards'] },
  { key: 'saves', label: 'Saves', format: 'count', names: ['Goalkeeper saves', 'Saves'] },
  { key: 'passes', label: 'Passes', format: 'count', names: ['Total passes'] },
  { key: 'pass_accuracy', label: 'Pass accuracy', format: 'percent', names: ['Passes accuracy', 'Pass accuracy'] },
  { key: 'xa', label: 'Expected assists (xA)', format: 'decimal', names: ['Expected Assists'] },
]

type StatBag = Map<string, number>

function bagOf(block: z.infer<typeof statBlockSchema> | undefined): StatBag {
  const bag: StatBag = new Map()
  for (const s of block?.statistics ?? []) {
    const v = num(s.value)
    if (v !== null) bag.set(s.displayName.trim().toLowerCase(), v)
  }
  return bag
}

function pick(bag: StatBag, names: string[]): number | null {
  for (const n of names) {
    const v = bag.get(n.toLowerCase())
    if (v !== undefined) return v
  }
  return null
}

/** Derived values the provider does not send directly. */
function derived(bag: StatBag, key: MatchStatKey): number | null {
  if (key === 'shots') {
    const inside = bag.get('shots within penalty area')
    const outside = bag.get('shots outside penalty area')
    if (inside !== undefined && outside !== undefined) return inside + outside
    const parts = ['shots on target', 'shots off target', 'blocked shots'].map((k) => bag.get(k))
    return parts.every((p) => p !== undefined) ? parts.reduce((a, b) => a! + b!, 0)! : null
  }
  if (key === 'pass_accuracy') {
    const ok = bag.get('successful passes')
    const total = bag.get('total passes')
    return ok !== undefined && total ? ok / total : null
  }
  return null
}

function asPercent(v: number): number {
  return Math.round(v <= 1 ? v * 100 : v)
}

/**
 * Normalises team statistics into paired lines (ours home/away), keeping a
 * line only when both sides have a value.
 */
export function normaliseStatistics(
  blocks: HlDetail['statistics'],
  hlHomeId: number,
  hlAwayId: number
): MatchStatLine[] {
  if (!blocks?.length) return []
  const home = bagOf(blocks.find((b) => b.team.id === hlHomeId))
  const away = bagOf(blocks.find((b) => b.team.id === hlAwayId))
  if (home.size === 0 && away.size === 0) return []

  const lines: MatchStatLine[] = []
  for (const s of STAT_SOURCES) {
    let h = pick(home, s.names) ?? derived(home, s.key)
    let a = pick(away, s.names) ?? derived(away, s.key)
    if (h === null || a === null) continue
    if (s.format === 'percent') {
      h = asPercent(h)
      a = asPercent(a)
    } else if (s.format === 'decimal') {
      h = Math.round(h * 100) / 100
      a = Math.round(a * 100) / 100
    } else {
      h = Math.round(h)
      a = Math.round(a)
    }
    lines.push({ key: s.key, label: s.label, home: h, away: a, format: s.format })
  }
  return lines
}

/* ------------------------------------------------------------------ *
 * Lineups, referee
 * ------------------------------------------------------------------ */

function entry(p: z.infer<typeof lineupPlayer>): LineupEntry {
  return { name: p.name.trim(), number: p.number ?? null, position: p.position?.trim() || null }
}

function teamLineup(t: z.infer<typeof teamLineupSchema> | null | undefined): TeamLineupData {
  return {
    formation: t?.formation?.trim() || null,
    rows: (t?.initialLineup ?? []).map((row) => row.map(entry)).filter((row) => row.length > 0),
    bench: (t?.substitutes ?? []).map(entry),
  }
}

/**
 * Lineups in OUR home/away order: the side whose upstream id is our home
 * team's Highlightly id goes first. Null when neither side has a starting XI.
 */
export function normaliseLineups(lineups: HlLineups, ourHomeHlId: number): MatchLineupsData | null {
  let home = lineups.homeTeam
  let away = lineups.awayTeam
  if (away?.id === ourHomeHlId && home?.id !== ourHomeHlId) [home, away] = [away, home]
  const result = { home: teamLineup(home), away: teamLineup(away) }
  if (result.home.rows.length === 0 && result.away.rows.length === 0) return null
  return result
}

/** "Oliver, Michael" -> "Michael Oliver". */
export function refereeName(name: string | null | undefined): string | null {
  const n = name?.trim()
  if (!n) return null
  const parts = n.split(',').map((p) => p.trim())
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : n
}
