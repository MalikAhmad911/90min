import { sql, type SQL } from 'drizzle-orm'
import { getDb } from './index'
import { addDays, localDayRangeUtc } from '@/lib/timezone'
import type { Match, MatchStatus } from '@/lib/types'
import { RED_CARD_COLUMNS, RED_CARD_JOIN, withRedCards } from './event-queries'

/**
 * Reads for the personalised home feed (PRD MAT-1).
 *
 * The match column list and row mapping mirror `lib/db/queries.ts`, which
 * keeps them private. They are repeated here rather than exported from there
 * because that file belongs to another module; the shapes must stay in step,
 * and the integrator can fold the two together by exporting MATCH_COLUMNS,
 * MATCH_FROM and toMatch from queries.ts.
 */

export interface MatchJoinRow extends Record<string, unknown> {
  id: number
  utcDate: Date | string
  status: string
  minute: number | null
  stage: string | null
  groupName: string
  homeScoreFt: number | null
  awayScoreFt: number | null
  homeScoreHt: number | null
  awayScoreHt: number | null
  competitionId: number
  competitionCode: string
  competitionName: string
  competitionEmblem: string | null
  homeId: number
  homeName: string
  homeShortName: string | null
  homeTla: string | null
  homeCrest: string | null
  awayId: number
  awayName: string
  awayShortName: string | null
  awayTla: string | null
  awayCrest: string | null
}

export function toMatch(r: MatchJoinRow): Match {
  return {
    id: r.id,
    utcDate: new Date(r.utcDate).toISOString(),
    status: r.status as MatchStatus,
    minute: r.minute ?? undefined,
    stage: r.stage ?? undefined,
    group: r.groupName || undefined,
    homeTeam: {
      id: r.homeId,
      name: r.homeName,
      shortName: r.homeShortName ?? r.homeName,
      tla: r.homeTla ?? '',
      crest: r.homeCrest ?? '',
    },
    awayTeam: {
      id: r.awayId,
      name: r.awayName,
      shortName: r.awayShortName ?? r.awayName,
      tla: r.awayTla ?? '',
      crest: r.awayCrest ?? '',
    },
    score: {
      fullTime: { home: r.homeScoreFt, away: r.awayScoreFt },
      halfTime: { home: r.homeScoreHt, away: r.awayScoreHt },
    },
    competition: {
      id: r.competitionId,
      name: r.competitionName,
      code: r.competitionCode,
      emblem: r.competitionEmblem ?? '',
    },
  }
}

export const MATCH_COLUMNS = sql`
  m.id,
  m.utc_date            as "utcDate",
  m.status,
  m.minute,
  m.stage,
  m.group_name          as "groupName",
  m.home_score_ft       as "homeScoreFt",
  m.away_score_ft       as "awayScoreFt",
  m.home_score_ht       as "homeScoreHt",
  m.away_score_ht       as "awayScoreHt",
  c.external_id         as "competitionId",
  c.code                as "competitionCode",
  c.name                as "competitionName",
  c.emblem              as "competitionEmblem",
  h.id                  as "homeId",
  h.name                as "homeName",
  h.short_name          as "homeShortName",
  h.tla                 as "homeTla",
  h.crest               as "homeCrest",
  a.id                  as "awayId",
  a.name                as "awayName",
  a.short_name          as "awayShortName",
  a.tla                 as "awayTla",
  a.crest               as "awayCrest"
`

export const MATCH_FROM = sql`
  from matches m
  join competitions c on c.code = m.competition_code
  join teams h on h.id = m.home_team_id
  join teams a on a.id = m.away_team_id
`

/** The neon-http driver returns `{ rows }`; other drivers return the array itself. */
export function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] }
  return r.rows ?? (result as T[])
}

export interface LocalDayPlan {
  /** First instant of the local day, as UTC. */
  start: Date
  /** First instant of the next local day, as UTC (exclusive). */
  end: Date
  /**
   * Every UTC calendar date the local day touches, oldest first. Usually two
   * (one when the zone is UTC); never outside date-1..date+1, because no
   * zone is more than 14 hours from UTC.
   */
  utcDates: string[]
}

/**
 * The query bounds for local calendar day `date` in `tz`.
 *
 * Kept separate from the query so the arithmetic can be tested without a
 * database. Throws on an invalid date or zone; callers validate first.
 */
export function localDayPlan(date: string, tz: string): LocalDayPlan {
  const { start, end } = localDayRangeUtc(date, tz)
  const first = start.toISOString().slice(0, 10)
  // `end` is exclusive, so the last instant inside the day is end - 1 ms.
  const last = new Date(end.getTime() - 1).toISOString().slice(0, 10)

  const utcDates: string[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) utcDates.push(d)
  return { start, end, utcDates }
}

/**
 * Every match kicking off within local day `date` in `tz`, in kickoff order.
 *
 * The `match_date IN (...)` predicate is what lets Postgres use
 * matches_match_date_idx (match_date, utc_date); the utc_date range then
 * trims the two partial UTC days down to the local day exactly.
 */
export async function getMatchesForLocalDay(date: string, tz: string): Promise<Match[]> {
  const { start, end, utcDates } = localDayPlan(date, tz)
  const dates: SQL = sql.join(
    utcDates.map((d) => sql`${d}::date`),
    sql`, `
  )
  const db = getDb()
  const result = await db.execute<MatchJoinRow>(
    sql`select ${MATCH_COLUMNS}, ${RED_CARD_COLUMNS} ${MATCH_FROM} ${RED_CARD_JOIN}
        where m.match_date in (${dates})
          and m.utc_date >= ${start.toISOString()}::timestamptz
          and m.utc_date <  ${end.toISOString()}::timestamptz
        order by m.utc_date asc, m.id asc`
  )
  return rowsOf<MatchJoinRow>(result).map((r) => withRedCards(toMatch(r), r))
}
