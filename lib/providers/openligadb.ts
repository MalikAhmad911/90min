import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

/**
 * OpenLigaDB client (https://www.openligadb.de).
 *
 * Why this provider: football-data's free plan has no goal scorers, while
 * OpenLigaDB publishes crowd-sourced, live-updated goals for the Bundesliga
 * and the Champions League under ODbL 1.0 (commercial use allowed, attribution
 * required - see OPENLIGADB_ATTRIBUTION). It has no cards, assists,
 * substitutions or lineups, and team logos are NOT covered by the licence, so
 * nothing image-related is read from it.
 *
 * Etiquette the operator asks for, and how this module honours it:
 *   - at most one request every 30-60 s per league during live play: every
 *     sync pass must first win `claimLeagueSlot`, a compare-and-set on a
 *     `sync_state` row, so all serverless instances share one budget;
 *   - poll `getlastchangedate` and refetch only when it changed: the sync
 *     stores the last seen change date per matchday;
 *   - name the app in the User-Agent;
 *   - cache centrally: readers only ever read our database, never upstream;
 *   - back off on 429/5xx: failures double the minimum interval.
 */

export const OPENLIGADB_BASE = 'https://api.openligadb.de'

/** Leagues we sync. Shortcuts are OpenLigaDB's own. */
export const OPENLIGADB_LEAGUES = ['bl1', 'ucl'] as const
export type OpenLigaDbLeague = (typeof OPENLIGADB_LEAGUES)[number]

/** Our competition code for each league. */
export const LEAGUE_TO_COMPETITION: Record<OpenLigaDbLeague, string> = {
  bl1: 'BL1',
  ucl: 'CL',
}

/** Competitions whose goals come from OpenLigaDB. Safe to import anywhere. */
export const OPENLIGADB_COMPETITIONS: readonly string[] = Object.values(LEAGUE_TO_COMPETITION)

/**
 * ODbL 1.0 requires attribution wherever the data is shown. The German
 * original is "Daten von OpenLigaDB (www.openligadb.de), lizenziert unter
 * ODbL 1.0"; the operator accepts an English equivalent.
 */
export const OPENLIGADB_ATTRIBUTION = {
  provider: 'OpenLigaDB',
  text: 'Goal data from OpenLigaDB (www.openligadb.de), licensed under ODbL 1.0',
  url: 'https://www.openligadb.de',
  license: 'ODbL-1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
} as const

export type ProviderAttribution = typeof OPENLIGADB_ATTRIBUTION

/* ------------------------------------------------------------------ *
 * Payload schemas
 *
 * Only the fields we use are declared; zod drops the rest. Crowd-sourced
 * data has gaps, so anything not needed to place a goal is nullable.
 * ------------------------------------------------------------------ */

const teamSchema = z.object({
  teamId: z.number().int(),
  teamName: z.string(),
  shortName: z.string().nullish(),
})

const goalSchema = z.object({
  goalID: z.number().int(),
  scoreTeam1: z.number().int().min(0),
  scoreTeam2: z.number().int().min(0),
  matchMinute: z.number().int().nullish(),
  goalGetterID: z.number().int().nullish(),
  goalGetterName: z.string().nullish(),
  scoringTeamId: z.number().int().nullish(),
  isPenalty: z.boolean().nullish(),
  isOwnGoal: z.boolean().nullish(),
  isOvertime: z.boolean().nullish(),
  comment: z.string().nullish(),
})

const matchSchema = z.object({
  matchID: z.number().int(),
  matchDateTimeUTC: z.string(),
  leagueShortcut: z.string().nullish(),
  group: z
    .object({ groupOrderID: z.number().int(), groupName: z.string().nullish() })
    .nullish(),
  team1: teamSchema,
  team2: teamSchema,
  matchIsFinished: z.boolean(),
  lastUpdateDateTime: z.string().nullish(),
  goals: z.array(goalSchema).nullish(),
})

export type OldbTeam = z.infer<typeof teamSchema>
export type OldbGoal = z.infer<typeof goalSchema>
export type OldbMatch = z.infer<typeof matchSchema>

const currentGroupSchema = z.object({ groupOrderID: z.number().int().min(1).max(60) })

/**
 * Validates a match list item by item. One malformed match (a half-edited
 * row on a crowd-sourced site) must not cost us the other 305.
 */
export function parseMatches(payload: unknown): { matches: OldbMatch[]; invalid: number } {
  if (!Array.isArray(payload)) throw new OpenLigaDbError('Expected a match list', 0, 'parse')
  const matches: OldbMatch[] = []
  let invalid = 0
  for (const item of payload) {
    const parsed = matchSchema.safeParse(item)
    if (parsed.success) matches.push(parsed.data)
    else invalid++
  }
  return { matches, invalid }
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

export class OpenLigaDbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string
  ) {
    super(message)
    this.name = 'OpenLigaDbError'
  }
}

/**
 * The User-Agent names the app and nothing else. If the operator ever asks
 * for a contact, set OPENLIGADB_CONTACT; it is sanitised so an env value can
 * never inject a header.
 */
export function userAgent(contact = process.env.OPENLIGADB_CONTACT): string {
  const base = '90MinTactics/1.0 (football scores app)'
  const clean = (contact ?? '').replace(/[^\x20-\x7e]/g, '').replace(/[()]/g, '').trim().slice(0, 100)
  return clean ? `90MinTactics/1.0 (football scores app; ${clean})` : base
}

const REQUEST_TIMEOUT_MS = 20_000

async function request(path: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${OPENLIGADB_BASE}${path}`, {
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
      // The database is our cache; Next's fetch cache would hide upstream
      // changes and make the change-date check meaningless.
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new OpenLigaDbError(
      `OpenLigaDB unreachable: ${err instanceof Error ? err.message : String(err)}`,
      0,
      path
    )
  }
  if (!res.ok) {
    throw new OpenLigaDbError(`OpenLigaDB answered ${res.status}`, res.status, path)
  }
  return res.json()
}

function assertLeague(league: string): asserts league is OpenLigaDbLeague {
  if (!(OPENLIGADB_LEAGUES as readonly string[]).includes(league)) {
    throw new OpenLigaDbError(`Unknown league ${league}`, 0, 'input')
  }
}

const seasonInput = z.number().int().min(2000).max(2100)
const groupInput = z.number().int().min(1).max(60)

/** Every match of a season - one request, used for backfill and periodic repair. */
export async function fetchSeason(league: OpenLigaDbLeague, season: number) {
  assertLeague(league)
  const s = seasonInput.parse(season)
  return parseMatches(await request(`/getmatchdata/${league}/${s}`))
}

/** One matchday ("group") - what live polling refetches. */
export async function fetchGroup(league: OpenLigaDbLeague, season: number, group: number) {
  assertLeague(league)
  return parseMatches(
    await request(`/getmatchdata/${league}/${seasonInput.parse(season)}/${groupInput.parse(group)}`)
  )
}

/** OpenLigaDB's own idea of the current matchday. */
export async function fetchCurrentGroup(league: OpenLigaDbLeague): Promise<number> {
  assertLeague(league)
  return currentGroupSchema.parse(await request(`/getcurrentgroup/${league}`)).groupOrderID
}

/**
 * When anything in a matchday last changed upstream, e.g.
 * "2026-11-20T12:07:02.16". Returned verbatim: it carries no zone, and it is
 * only ever compared with the previous value, never with our clock.
 */
export async function fetchLastChangeDate(
  league: OpenLigaDbLeague,
  season: number,
  group: number
): Promise<string> {
  assertLeague(league)
  const value = await request(
    `/getlastchangedate/${league}/${seasonInput.parse(season)}/${groupInput.parse(group)}`
  )
  return z.string().min(1).max(40).parse(value)
}

/**
 * Turns a change date into a Date for storage in a timestamp column. The
 * zone-less wall clock is read as UTC: consistent on both sides of the
 * comparison, which is all that matters. Null when unparsable.
 */
export function changeDateToTimestamp(value: string): Date | null {
  const withZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`
  const d = new Date(withZone)
  return Number.isNaN(d.getTime()) ? null : d
}

/** OpenLigaDB names a season by its starting year: 2026 for 2026/27. */
export function seasonFor(date: Date): number {
  const year = date.getUTCFullYear()
  // European seasons start in July/August; June still belongs to the old one.
  return date.getUTCMonth() >= 6 ? year : year - 1
}

/* ------------------------------------------------------------------ *
 * Etiquette guard
 * ------------------------------------------------------------------ */

/** Minimum gap between two sync passes for one league. A pass makes at most two requests. */
export const MIN_INTERVAL_MS = 60_000
/** Backoff ceiling after repeated failures. */
export const MAX_BACKOFF_MS = 60 * 60_000

export interface SlotState {
  lastAttemptAt: Date | null
  consecutiveFailures: number
}

/**
 * Whether a pass may talk to OpenLigaDB now. Each consecutive failure (429,
 * 5xx, timeout) doubles the wait, capped at an hour, so a struggling server
 * is left alone rather than hammered by every instance that wakes up.
 */
export function slotDecision(
  state: SlotState | null,
  now: number,
  minIntervalMs = MIN_INTERVAL_MS
): { allowed: boolean; waitMs: number } {
  if (!state?.lastAttemptAt) return { allowed: true, waitMs: 0 }
  const failures = Math.max(0, Math.min(state.consecutiveFailures, 16))
  const interval = Math.min(minIntervalMs * 2 ** failures, MAX_BACKOFF_MS)
  const elapsed = now - state.lastAttemptAt.getTime()
  return elapsed >= interval ? { allowed: true, waitMs: 0 } : { allowed: false, waitMs: interval - elapsed }
}

export function slotResource(league: OpenLigaDbLeague): string {
  return `openligadb:${league}`
}

type Row = Record<string, unknown>
function rowsOf(result: unknown): Row[] {
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[]
}

/**
 * Claims the league's request slot for this pass.
 *
 * Compare-and-set on `sync_state.last_attempt_at`: read the row, decide in JS
 * (so `slotDecision` is the single, tested rule), then update only if nobody
 * else moved the timestamp meanwhile. Two instances racing therefore cannot
 * both win. The timestamp is written from JS at millisecond precision so the
 * comparison round-trips exactly.
 */
export async function claimLeagueSlot(
  league: OpenLigaDbLeague,
  now = new Date()
): Promise<{ claimed: boolean; waitMs: number }> {
  const db = getDb()
  const resource = slotResource(league)
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

  const decision = slotDecision(state, now.getTime())
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
  return won.length > 0 ? { claimed: true, waitMs: 0 } : { claimed: false, waitMs: MIN_INTERVAL_MS }
}

/** Records how the pass that held the slot went; failures widen the next interval. */
export async function releaseLeagueSlot(
  league: OpenLigaDbLeague,
  outcome: { ok: true } | { ok: false; error: string }
): Promise<void> {
  const db = getDb()
  const resource = slotResource(league)
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

/* ------------------------------------------------------------------ *
 * Goal parsing
 * ------------------------------------------------------------------ */

/**
 * Minute and stoppage time of a goal.
 *
 * Observed upstream conventions (2026/27 Bundesliga and Champions League):
 *   - stoppage time is usually the absolute minute plus `isOvertime`, e.g.
 *     92 + isOvertime means 90+2 and 46 + isOvertime means 45+1;
 *   - some editors write the base minute and put "+11" in `comment`.
 * `comment` is otherwise free text (one goal carries a player's name), so it
 * is read only when it is exactly "+N".
 *
 * `extraTime` says whether the competition can go to extra time; in a league
 * a 106th-minute goal can only be 90+16, in a knockout it is 105+1.
 */
export function parseGoalMinute(
  goal: Pick<OldbGoal, 'matchMinute' | 'isOvertime' | 'comment'>,
  extraTime = false
): { minute: number | null; addedTime: number | null } {
  const raw = goal.matchMinute
  if (raw == null || !Number.isInteger(raw) || raw < 0 || raw > 150) {
    return { minute: null, addedTime: null }
  }

  const bases = extraTime ? [45, 90, 105, 120] : [45, 90]
  const plus = goal.comment?.trim().match(/^\+\s*(\d{1,2})$/)
  if (plus) {
    const added = Number(plus[1])
    if (added >= 1 && added <= 30) {
      if (bases.includes(raw)) return { minute: raw, addedTime: added }
      if (bases.includes(raw - added)) return { minute: raw - added, addedTime: added }
    }
  }

  if (goal.isOvertime) {
    // The latest period end strictly before the minute is the one it overran.
    const base = [...bases].reverse().find((b) => raw > b)
    if (base !== undefined && raw - base <= 30) return { minute: base, addedTime: raw - base }
  }

  return { minute: raw, addedTime: null }
}

export type GoalEventType = 'GOAL' | 'PENALTY_GOAL' | 'OWN_GOAL'

/** Own goal wins over penalty: a penalty cannot be an own goal, and OG is the safer label. */
export function goalType(goal: Pick<OldbGoal, 'isOwnGoal' | 'isPenalty'>): GoalEventType {
  if (goal.isOwnGoal) return 'OWN_GOAL'
  if (goal.isPenalty) return 'PENALTY_GOAL'
  return 'GOAL'
}

/* ------------------------------------------------------------------ *
 * Team names
 * ------------------------------------------------------------------ */

/** Letters NFD cannot decompose. */
const LETTERS: Record<string, string> = { ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ı: 'i' }

/** Lower-case, ASCII, punctuation-free, single-spaced. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ßøæœłđı]/g, (c) => LETTERS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Club-form tokens that carry no identity: "1. FC Köln" and "FC Köln" are the
 * same club, as are "Liverpool FC" and "FC Liverpool". Whole tokens only, so
 * "Schalke" never loses an "s". Founding years and club numbers ("04", "1899")
 * go too.
 */
const NOISE = new Set([
  'fc', 'cf', 'sc', 'sk', 'ssc', 'as', 'ac', 'afc', 'kv', 'osc', 'fk', 'pae', 'rc', 'club',
  'de', 'sv', 'tsg', 'vfl', 'vfb', 'fsv', 'ssv', 'tsv', 'bsc', 'ev', 'e', 'v', 'spvgg', 'rb',
])

export function nameCore(name: string): string {
  return normaliseName(name)
    .split(' ')
    .map((t) => (t === 'st' ? 'saint' : t))
    .filter((t) => t && !NOISE.has(t) && !/^\d+$/.test(t))
    .join(' ')
}

/**
 * Names normalisation cannot reconcile. Keys are the canonical name (any form
 * - it is normalised too), values the spellings that mean the same club.
 * Both our names and OpenLigaDB's go through this, so it only has to be
 * right, not complete.
 */
const ALIASES: [string, string[]][] = [
  // Bundesliga
  ['FC Bayern München', ['Bayern München', 'Bayern Munich', 'Bayern', 'FC Bayern']],
  ['Borussia Mönchengladbach', ['Bor. Mönchengladbach', 'Mönchengladbach', 'Gladbach', "M'gladbach", "Borussia M'gladbach"]],
  ['1. FC Köln', ['Köln', 'FC Köln', 'Cologne', '1. FC Koeln']],
  ['Bayer 04 Leverkusen', ['Bayer Leverkusen', 'Leverkusen']],
  ['TSG 1899 Hoffenheim', ['TSG Hoffenheim', '1899 Hoffenheim', 'Hoffenheim']],
  ['Hamburger SV', ['HSV', 'Hamburg']],
  ['SV Werder Bremen', ['Werder Bremen', 'Bremen']],
  ['FC Schalke 04', ['Schalke 04', 'Schalke', 'S04']],
  ['1. FSV Mainz 05', ['Mainz 05', 'Mainz']],
  ['1. FC Union Berlin', ['Union Berlin']],
  ['Eintracht Frankfurt', ['Frankfurt']],
  // Champions League (OpenLigaDB uses German spellings)
  ['FC Internazionale Milano', ['Inter Mailand', 'Inter Milan', 'Inter']],
  ['AS Roma', ['AS Rom', 'Rom']],
  ['Galatasaray SK', ['Galatasaray Istanbul', 'Galatasaray']],
  ['PSV', ['PSV Eindhoven']],
  ['LASK Linz', ['LASK']],
  ['PAE AEK', ['AEK Athen', 'AEK Athens']],
  ['SK Slavia Praha', ['Slavia Prag', 'Slavia Prague']],
  ['Real Betis Balompié', ['Real Betis', 'Betis']],
  ['Paris Saint-Germain FC', ['Paris St. Germain', 'PSG', 'Paris']],
  ['Club Atlético de Madrid', ['Atletico Madrid', 'Atlético Madrid', 'Atleti']],
  ['Manchester United FC', ['Manchester United', 'ManU', 'Man United']],
  ['Manchester City FC', ['Man City', "Man'City"]],
  ['Club Brugge KV', ['FC Brügge', 'Club Brügge', 'Brügge']],
  ['FC Barcelona', ['Barcelona', 'Barça']],
  ['Real Madrid CF', ['Real Madrid']],
  ['FK Shakhtar Donetsk', ['Shakhtar Donetsk', 'Schachtar Donezk']],
  ['Sporting Clube de Portugal', ['Sporting CP', 'Sporting Lissabon']],
]

const ALIAS_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>()
  for (const [canonical, aliases] of ALIASES) {
    const target = nameCore(canonical)
    for (const alias of aliases) index.set(nameCore(alias), target)
  }
  return index
})()

/** The comparison key for a team name: its core, then the alias table. */
export function teamKey(name: string): string {
  const core = nameCore(name)
  return ALIAS_INDEX.get(core) ?? core
}

export interface CandidateTeam {
  id: number
  name: string
  shortName: string | null
}

/**
 * Finds our team for an OpenLigaDB team, among `candidates` only (the teams
 * that play in the competition being synced - never the whole table, so
 * "Sporting" cannot drift to the wrong country's club).
 *
 * Returns the id only when exactly one candidate matches; otherwise the
 * reason, so the caller can log it. Never guesses: no substrings, no fuzzy
 * distance. The upstream full name is tried before its short name, which is
 * looser ("FCB", "Paris").
 */
export function matchTeam(
  team: Pick<OldbTeam, 'teamName' | 'shortName'>,
  candidates: CandidateTeam[]
): { id: number } | { id: null; reason: 'none' | 'ambiguous' } {
  const keyed = candidates.map((c) => ({
    id: c.id,
    keys: new Set([teamKey(c.name), c.shortName ? teamKey(c.shortName) : ''].filter(Boolean)),
  }))

  for (const name of [team.teamName, team.shortName]) {
    if (!name?.trim()) continue
    const key = teamKey(name)
    if (!key) continue
    const hits = new Set(keyed.filter((c) => c.keys.has(key)).map((c) => c.id))
    if (hits.size === 1) return { id: [...hits][0] }
    if (hits.size > 1) return { id: null, reason: 'ambiguous' }
  }
  return { id: null, reason: 'none' }
}
