import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  OPENLIGADB_ATTRIBUTION,
  OPENLIGADB_COMPETITIONS,
  type ProviderAttribution,
} from '@/lib/providers/openligadb'
import { HIGHLIGHTLY_COMPETITIONS } from '@/lib/providers/highlightly/leagues'
import { isUndefinedTable } from '@/lib/server/sync/sync-state'
import type {
  Match,
  MatchDetailsExtras,
  MatchGoal,
  MatchLineupsData,
  MatchStatLine,
  MatchTimelineEvent,
  TimelineEventType,
} from '@/lib/types'

/**
 * Read path for provider match events and details.
 *
 * Source per match, never mixed: when Highlightly has events for a match it
 * supplies the whole timeline (goals with assists, cards, substitutions, VAR)
 * and the goals; otherwise OpenLigaDB's goals are used (BL1 and CL only,
 * with the ODbL notice). Highlightly is preferred because it is the richer
 * feed; OpenLigaDB stays the fallback for matches Highlightly's daily budget
 * did not reach.
 *
 * Kept apart from queries.ts so the events module can evolve without
 * touching the core match queries other modules depend on.
 */

/** A goal as served to clients. `cancelled` = disallowed after the fact (VAR). */
export interface EventGoal extends MatchGoal {
  cancelled: boolean
}

/**
 * Whether goal events can exist for a match:
 *   'match'       - the match is mapped to OpenLigaDB, so an empty list means no goals;
 *   'competition' - the competition is covered but this match is not mapped (yet);
 *   'none'        - no provider covers the competition.
 */
export type GoalCoverage = 'match' | 'competition' | 'none'

/** Fields the events module adds to a match payload. All optional for older payloads. */
export interface MatchEventsExtras extends MatchDetailsExtras {
  goals?: (MatchGoal & { cancelled?: boolean })[]
  /** Present whenever the goals shown come from OpenLigaDB (ODbL requires it). */
  attribution?: ProviderAttribution | null
  goalCoverage?: GoalCoverage
  /** Finished match whose (non-cancelled) goals do not add up to the score shown. */
  goalsDisagreeWithScore?: boolean
}

/** football-data's goal type vocabulary, which the timeline already understands. */
const TYPE_TO_CLIENT: Record<string, string> = {
  GOAL: 'REGULAR',
  PENALTY_GOAL: 'PENALTY',
  OWN_GOAL: 'OWN',
}

type Row = Record<string, unknown>
function rowsOf(result: unknown): Row[] {
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[]
}

/** The match's goals in playing order, cancelled ones included. */
export async function getMatchGoals(matchId: number): Promise<EventGoal[]> {
  const rows = rowsOf(
    await getDb().execute(sql`
      select e.type, e.minute, e.added_time as "addedTime", e.team_id as "teamId",
             t.name as "teamName", e.player_id as "playerId", e.player_name as "playerName",
             e.score_home as "scoreHome", e.score_away as "scoreAway",
             e.is_cancelled as "cancelled"
      from match_events e
      left join teams t on t.id = e.team_id
      where e.match_id = ${matchId}
        and e.provider = 'openligadb'
        and e.type in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL')
      order by coalesce(e.minute, 0), coalesce(e.added_time, 0),
               coalesce(e.score_home, 0) + coalesce(e.score_away, 0), e.id`)
  )

  return rows.map((r) => ({
    minute: Number(r.minute ?? 0),
    injuryTime: r.addedTime == null ? null : Number(r.addedTime),
    type: TYPE_TO_CLIENT[String(r.type)] ?? 'REGULAR',
    team: { id: Number(r.teamId ?? 0), name: String(r.teamName ?? '') },
    // 0 = no player id: OpenLigaDB players are not mapped to ours.
    scorer: { id: Number(r.playerId ?? 0), name: String(r.playerName ?? 'Unknown scorer') },
    assist: null,
    score: {
      home: r.scoreHome == null ? null : Number(r.scoreHome),
      away: r.scoreAway == null ? null : Number(r.scoreAway),
    },
    cancelled: Boolean(r.cancelled),
  }))
}

async function isMatchMapped(matchId: number): Promise<boolean> {
  const rows = rowsOf(
    await getDb().execute(sql`
      select 1 from provider_map
      where provider = 'openligadb' and entity_type = 'match' and our_key = ${String(matchId)}
      limit 1`)
  )
  return rows.length > 0
}

/** True when a finished match's live goals do not add up to its score. */
export function goalsDisagree(
  match: Pick<Match, 'status' | 'score' | 'homeTeam' | 'awayTeam'>,
  goals: EventGoal[]
): boolean {
  if (match.status !== 'FINISHED') return false
  const { home, away } = match.score.fullTime
  if (home == null || away == null) return false
  const live = goals.filter((g) => !g.cancelled)
  const h = live.filter((g) => g.team.id === match.homeTeam.id).length
  const a = live.filter((g) => g.team.id === match.awayTeam.id).length
  return h !== home || a !== away
}

/* ------------------------------------------------------------------ *
 * Highlightly timeline
 * ------------------------------------------------------------------ */

const GOAL_TYPES = new Set(['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'])

export interface EventRow {
  type: TimelineEventType
  minute: number | null
  addedTime: number | null
  teamId: number | null
  teamName: string | null
  playerName: string | null
  related: string | null
  scoreHome: number | null
  scoreAway: number | null
  detail: string | null
  cancelled: boolean
}

/** Every Highlightly event of a match in playing order, cancelled ones included. */
export async function getHighlightlyEvents(matchId: number): Promise<EventRow[]> {
  const rows = rowsOf(
    await getDb().execute(sql`
      select e.type, e.minute, e.added_time as "addedTime", e.team_id as "teamId", t.name as "teamName",
             e.player_name as "playerName", e.related_player_name as "related",
             e.score_home as "scoreHome", e.score_away as "scoreAway", e.detail,
             e.is_cancelled as "cancelled"
      from match_events e
      left join teams t on t.id = e.team_id
      where e.match_id = ${matchId} and e.provider = 'highlightly'
      order by coalesce(e.minute, 0), coalesce(e.added_time, 0), e.id`)
  )
  return rows.map((r) => ({
    type: String(r.type) as TimelineEventType,
    minute: r.minute == null ? null : Number(r.minute),
    addedTime: r.addedTime == null ? null : Number(r.addedTime),
    teamId: r.teamId == null ? null : Number(r.teamId),
    teamName: (r.teamName as string | null) ?? null,
    playerName: (r.playerName as string | null) ?? null,
    related: (r.related as string | null) ?? null,
    scoreHome: r.scoreHome == null ? null : Number(r.scoreHome),
    scoreAway: r.scoreAway == null ? null : Number(r.scoreAway),
    detail: (r.detail as string | null) ?? null,
    cancelled: Boolean(r.cancelled),
  }))
}

/**
 * The client timeline. Cancelled non-goal events are corrections and are
 * dropped; cancelled goals stay, struck through.
 */
export function toTimeline(
  rows: EventRow[],
  match: Pick<Match, 'homeTeam' | 'awayTeam'>
): MatchTimelineEvent[] {
  return rows
    .filter((r) => !r.cancelled || GOAL_TYPES.has(r.type))
    .map((r) => ({
      type: r.type,
      minute: r.minute,
      addedTime: r.addedTime,
      side: r.teamId === match.homeTeam.id ? 'home' : r.teamId === match.awayTeam.id ? 'away' : null,
      player: r.playerName,
      related: r.related,
      detail: r.detail,
      cancelled: r.cancelled,
    }))
}

/** Goals in the shape the scorers summary already understands. */
export function goalsFromEvents(rows: EventRow[]): EventGoal[] {
  return rows
    .filter((r) => GOAL_TYPES.has(r.type))
    .map((r) => ({
      minute: r.minute ?? 0,
      injuryTime: r.addedTime,
      type: TYPE_TO_CLIENT[r.type] ?? 'REGULAR',
      team: { id: r.teamId ?? 0, name: r.teamName ?? '' },
      scorer: { id: 0, name: r.playerName ?? 'Unknown scorer' },
      assist: r.related ? { id: 0, name: r.related } : null,
      score: { home: r.scoreHome, away: r.scoreAway },
      cancelled: r.cancelled,
    }))
}

/* ------------------------------------------------------------------ *
 * Lineups and statistics
 * ------------------------------------------------------------------ */

export interface StoredDetails {
  lineups: MatchLineupsData | null
  statistics: MatchStatLine[] | null
  provider: string
}

/**
 * Lineups and statistics for a match, or null. Until the match_details
 * migration is applied the table does not exist; that reads as "no data".
 */
export async function getMatchDetails(matchId: number): Promise<StoredDetails | null> {
  try {
    const row = rowsOf(
      await getDb().execute(sql`
        select provider, lineups, statistics from match_details where match_id = ${matchId}`)
    )[0]
    if (!row) return null
    const statistics = Array.isArray(row.statistics) ? (row.statistics as MatchStatLine[]) : null
    const lineups =
      row.lineups && typeof row.lineups === 'object' ? (row.lineups as MatchLineupsData) : null
    return { provider: String(row.provider), lineups, statistics: statistics?.length ? statistics : null }
  } catch (err) {
    if (isUndefinedTable(err)) return null
    throw err
  }
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

/**
 * Adds provider events, goals, coverage, attribution, lineups and statistics
 * to a match. Used by the match API route and the server-rendered match
 * page, so both serve the same shape. Provider goals replace whatever
 * `goals` held only when there are any; a payload that already carries goals
 * (the no-database fallback) is otherwise left as it was.
 */
export async function withMatchEvents<T extends Match & { goals?: MatchGoal[] }>(
  match: T
): Promise<T & MatchEventsExtras> {
  const [hlRows, details] = await Promise.all([
    getHighlightlyEvents(match.id),
    getMatchDetails(match.id),
  ])
  const detailExtras: MatchDetailsExtras = {
    lineups: details?.lineups ?? null,
    statistics: details?.statistics ?? null,
    detailsSource: hlRows.length > 0 || details ? 'highlightly' : null,
  }

  if (hlRows.length > 0) {
    const goals = goalsFromEvents(hlRows)
    return {
      ...match,
      ...detailExtras,
      events: toTimeline(hlRows, match),
      goals,
      goalCoverage: 'match',
      attribution: null,
      goalsDisagreeWithScore: goalsDisagree(match, goals),
    }
  }

  const withOldb = await withOpenLigaDbGoals(match)
  const highlightlyCovers = HIGHLIGHTLY_COMPETITIONS.includes(match.competition.code)
  return {
    ...withOldb,
    ...detailExtras,
    goalCoverage:
      withOldb.goalCoverage === 'none' && highlightlyCovers ? 'competition' : withOldb.goalCoverage,
  }
}

/** OpenLigaDB goals (BL1, CL) with the ODbL attribution. */
async function withOpenLigaDbGoals<T extends Match & { goals?: MatchGoal[] }>(
  match: T
): Promise<T & MatchEventsExtras> {
  const covered = OPENLIGADB_COMPETITIONS.includes(match.competition.code)
  if (!covered) return { ...match, goalCoverage: 'none', attribution: null }

  const [goals, mapped] = await Promise.all([getMatchGoals(match.id), isMatchMapped(match.id)])
  const coverage: GoalCoverage = mapped ? 'match' : 'competition'
  if (goals.length === 0) {
    return {
      ...match,
      goalCoverage: coverage,
      attribution: mapped ? OPENLIGADB_ATTRIBUTION : null,
      goalsDisagreeWithScore: mapped ? goalsDisagree(match, goals) : false,
    }
  }
  return {
    ...match,
    goals,
    goalCoverage: coverage,
    attribution: OPENLIGADB_ATTRIBUTION,
    goalsDisagreeWithScore: goalsDisagree(match, goals),
  }
}

/* ------------------------------------------------------------------ *
 * Red cards on match rows (PRD MAT-4)
 * ------------------------------------------------------------------ */

/**
 * Columns plus a lateral join adding red-card counts per side to a match
 * list query (matches aliased `m`). One lookup per match on
 * match_events_match_idx; a day's list is a few dozen matches.
 */
export const RED_CARD_COLUMNS = sql`rc.home as "redHome", rc.away as "redAway"`
export const RED_CARD_JOIN = sql`
  left join lateral (
    select count(*) filter (where e.team_id = m.home_team_id)::int as home,
           count(*) filter (where e.team_id = m.away_team_id)::int as away
    from match_events e
    where e.match_id = m.id and e.type in ('RED_CARD', 'SECOND_YELLOW') and not e.is_cancelled
  ) rc on true`

/** Adds `redCards` to a mapped match when the row carries any. */
export function withRedCards<M extends Match>(match: M, row: Record<string, unknown>): M {
  const home = Number(row.redHome ?? 0)
  const away = Number(row.redAway ?? 0)
  return home > 0 || away > 0 ? { ...match, redCards: { home, away } } : match
}
