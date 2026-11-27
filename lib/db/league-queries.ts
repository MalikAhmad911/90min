import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from './index'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'
import { STANDINGS_VIEWS, type FinishedMatch } from '@/lib/standings-splits'

/**
 * League-depth reads: fixtures by round and stat leaders.
 * All pure database reads - no provider calls on a page request.
 */

/* ------------------------------------------------------------------ *
 * Input schemas (shared by the routes and the tests)
 * ------------------------------------------------------------------ */

/** A competition code we carry. Upper-cased first so '/api/league/pl/...' works. */
export const leagueCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(FREE_COMPETITION_CODES as [string, ...string[]]))

/** `?matchday=` is optional; absent means "the season's current round". */
export const fixturesQuerySchema = z.object({
  matchday: z.coerce.number().int().min(1).max(60).optional(),
})

/** `?view=` on /api/standings: absent means the overall table. */
export const standingsViewSchema = z.enum(STANDINGS_VIEWS).default('total')

export const leadersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/** Parses `?limit=` (absent -> default). Null when present but invalid. */
export function leaderQueryOrDefault(limit: string | null): { limit: number } | null {
  const parsed = leadersQuerySchema.safeParse({ limit: limit ?? undefined })
  return parsed.success ? parsed.data : null
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface FixtureTeam {
  id: number
  name: string
  shortName: string
  crest: string
}

export interface Fixture {
  id: number
  utcDate: string
  status: string
  minute: number | null
  matchday: number | null
  homeTeam: FixtureTeam
  awayTeam: FixtureTeam
  score: { home: number | null; away: number | null }
}

export interface FixturesByRound {
  code: string
  seasonId: number | null
  /** The round shown. */
  matchday: number | null
  /** The season's current round, from seasons.current_matchday. */
  currentMatchday: number | null
  /** Rounds that exist in the stored fixture list, ascending. */
  matchdays: number[]
  fixtures: Fixture[]
}

export interface Leader {
  playerId: number
  playerName: string
  teamId: number
  teamName: string
  teamCrest: string
  value: number
  playedMatches: number | null
}

export interface Leaders {
  code: string
  seasonId: number | null
  goals: Leader[]
  assists: Leader[]
}

function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] }
  return r.rows ?? (result as T[])
}

/* ------------------------------------------------------------------ *
 * Season resolution
 * ------------------------------------------------------------------ */

/**
 * The season a competition is in now, with its current round.
 *
 * competitions.current_season_id is only set once a standings sync has run,
 * so fall back to the newest season seen in the fixture feed. The round
 * comes from `seasons`, which every fixture sync refreshes.
 */
export async function getCurrentSeason(
  code: string
): Promise<{ seasonId: number; currentMatchday: number | null } | null> {
  const db = getDb()
  const rows = rowsOf<{ seasonId: number; currentMatchday: number | null }>(
    await db.execute(sql`
      select s.id as "seasonId", s.current_matchday as "currentMatchday"
      from seasons s
      left join competitions c on c.code = s.competition_code
      where s.competition_code = ${code}
      order by (s.id = c.current_season_id) desc nulls last, s.start_date desc nulls last, s.id desc
      limit 1`)
  )
  if (rows.length === 0) return null
  return { seasonId: Number(rows[0].seasonId), currentMatchday: rows[0].currentMatchday }
}

/* ------------------------------------------------------------------ *
 * Fixtures by round (PRD LG-1)
 * ------------------------------------------------------------------ */

interface FixtureRow {
  id: number
  utcDate: Date | string
  status: string
  minute: number | null
  matchday: number | null
  homeId: number
  homeName: string
  homeShort: string | null
  homeCrest: string | null
  awayId: number
  awayName: string
  awayShort: string | null
  awayCrest: string | null
  homeScore: number | null
  awayScore: number | null
}

export async function getFixturesByRound(code: string, matchday?: number): Promise<FixturesByRound> {
  const season = await getCurrentSeason(code)
  const empty: FixturesByRound = {
    code,
    seasonId: season?.seasonId ?? null,
    matchday: null,
    currentMatchday: season?.currentMatchday ?? null,
    matchdays: [],
    fixtures: [],
  }
  if (!season) return empty

  const db = getDb()
  const rounds = rowsOf<{ matchday: number }>(
    await db.execute(sql`
      select distinct matchday from matches
      where competition_code = ${code} and season_id = ${season.seasonId} and matchday is not null
      order by matchday`)
  ).map((r) => Number(r.matchday))

  // Default to the current round; clamp to rounds we actually hold so a cup
  // with no matchdays, or a stale current_matchday, still yields a sane answer.
  const wanted = matchday ?? season.currentMatchday ?? rounds[0] ?? null
  if (wanted == null) return { ...empty, matchdays: rounds }

  const rows = rowsOf<FixtureRow>(
    await db.execute(sql`
      select m.id, m.utc_date as "utcDate", m.status, m.minute, m.matchday,
             h.id as "homeId", h.name as "homeName", h.short_name as "homeShort", h.crest as "homeCrest",
             a.id as "awayId", a.name as "awayName", a.short_name as "awayShort", a.crest as "awayCrest",
             m.home_score_ft as "homeScore", m.away_score_ft as "awayScore"
      from matches m
      join teams h on h.id = m.home_team_id
      join teams a on a.id = m.away_team_id
      where m.competition_code = ${code}
        and m.season_id = ${season.seasonId}
        and m.matchday = ${wanted}
      order by m.utc_date asc, m.id asc`)
  )

  return {
    ...empty,
    matchday: wanted,
    matchdays: rounds,
    fixtures: rows.map((r) => ({
      id: Number(r.id),
      utcDate: new Date(r.utcDate).toISOString(),
      status: r.status,
      minute: r.minute,
      matchday: r.matchday,
      homeTeam: {
        id: Number(r.homeId),
        name: r.homeName,
        shortName: r.homeShort ?? r.homeName,
        crest: r.homeCrest ?? '',
      },
      awayTeam: {
        id: Number(r.awayId),
        name: r.awayName,
        shortName: r.awayShort ?? r.awayName,
        crest: r.awayCrest ?? '',
      },
      score: { home: r.homeScore, away: r.awayScore },
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Stat leaders
 * ------------------------------------------------------------------ */

interface LeaderRow {
  playerId: number
  playerName: string
  teamId: number
  teamName: string
  teamShort: string | null
  teamCrest: string | null
  goals: number
  assists: number | null
  playedMatches: number | null
}

/**
 * Goals and assists leaderboards from the `scorers` table.
 *
 * The provider's scorers feed is the top ~30 goalscorers only, so the assists
 * list ranks assists among those players - a creative midfielder who rarely
 * scores will be missing. The UI says so rather than implying a full table.
 */
export async function getLeaders(code: string, limit = 10): Promise<Leaders> {
  const db = getDb()
  const seasonRows = rowsOf<{ seasonId: number | null }>(
    await db.execute(sql`
      select coalesce(
        (select current_season_id from competitions where code = ${code}),
        (select max(season_id) from scorers where competition_code = ${code})
      ) as "seasonId"`)
  )
  const seasonId = seasonRows[0]?.seasonId != null ? Number(seasonRows[0].seasonId) : null
  if (seasonId == null) return { code, seasonId: null, goals: [], assists: [] }

  const rows = rowsOf<LeaderRow>(
    await db.execute(sql`
      select s.player_id as "playerId", s.player_name as "playerName",
             t.id as "teamId", t.name as "teamName", t.short_name as "teamShort", t.crest as "teamCrest",
             s.goals, s.assists, s.played_matches as "playedMatches"
      from scorers s
      join teams t on t.id = s.team_id
      where s.competition_code = ${code} and s.season_id = ${seasonId}`)
  )

  const toLeader = (r: LeaderRow, value: number): Leader => ({
    playerId: Number(r.playerId),
    playerName: r.playerName,
    teamId: Number(r.teamId),
    teamName: r.teamShort ?? r.teamName,
    teamCrest: r.teamCrest ?? '',
    value,
    playedMatches: r.playedMatches,
  })

  // Ties: fewer matches played ranks higher (the usual tiebreak), then name.
  const rank = (a: Leader, b: Leader) =>
    b.value - a.value ||
    (a.playedMatches ?? 999) - (b.playedMatches ?? 999) ||
    a.playerName.localeCompare(b.playerName)

  return {
    code,
    seasonId,
    goals: rows
      .map((r) => toLeader(r, r.goals))
      .filter((l) => l.value > 0)
      .sort(rank)
      .slice(0, limit),
    assists: rows
      .filter((r) => r.assists != null && r.assists > 0)
      .map((r) => toLeader(r, r.assists!))
      .sort(rank)
      .slice(0, limit),
  }
}

/* ------------------------------------------------------------------ *
 * Finished matches for form and home/away tables (PRD LG-1)
 * ------------------------------------------------------------------ */

interface FinishedMatchRow {
  id: number
  utcDate: Date | string
  stage: string | null
  homeId: number
  homeName: string
  homeShort: string | null
  homeTla: string | null
  homeCrest: string | null
  awayId: number
  awayName: string
  awayShort: string | null
  awayTla: string | null
  awayCrest: string | null
  homeGoals: number
  awayGoals: number
}

/**
 * Every finished match of the season the stored standings belong to
 * (competitions.current_season_id), oldest first, in one query.
 *
 * Some fixture feeds arrive without a season id, so a match with a null
 * `season_id` still counts when it falls inside that season's dates (a day
 * of slack either side, since the dates are calendar days). Stage and group
 * filtering happen in lib/standings-splits.ts against each stored table.
 */
export async function getFinishedLeagueMatches(code: string): Promise<FinishedMatch[]> {
  const db = getDb()
  const rows = rowsOf<FinishedMatchRow>(
    await db.execute(sql`
      select m.id, m.utc_date as "utcDate", m.stage,
             h.id as "homeId", h.name as "homeName", h.short_name as "homeShort", h.tla as "homeTla", h.crest as "homeCrest",
             a.id as "awayId", a.name as "awayName", a.short_name as "awayShort", a.tla as "awayTla", a.crest as "awayCrest",
             m.home_score_ft as "homeGoals", m.away_score_ft as "awayGoals"
      from matches m
      join competitions c on c.code = m.competition_code
      left join seasons s on s.id = c.current_season_id
      join teams h on h.id = m.home_team_id
      join teams a on a.id = m.away_team_id
      where m.competition_code = ${code}
        and c.current_season_id is not null
        and m.status in ('FINISHED', 'AWARDED')
        and m.home_score_ft is not null
        and m.away_score_ft is not null
        and (
          m.season_id = c.current_season_id
          or (
            m.season_id is null
            and s.start_date is not null
            and m.match_date between s.start_date - 1 and coalesce(s.end_date, current_date) + 1
          )
        )
      order by m.utc_date asc, m.id asc`)
  )

  return rows.map((r) => ({
    id: Number(r.id),
    utcDate: new Date(r.utcDate).toISOString(),
    stage: r.stage,
    homeTeam: {
      id: Number(r.homeId),
      name: r.homeName,
      shortName: r.homeShort ?? r.homeName,
      tla: r.homeTla ?? '',
      crest: r.homeCrest ?? '',
    },
    awayTeam: {
      id: Number(r.awayId),
      name: r.awayName,
      shortName: r.awayShort ?? r.awayName,
      tla: r.awayTla ?? '',
      crest: r.awayCrest ?? '',
    },
    homeGoals: Number(r.homeGoals),
    awayGoals: Number(r.awayGoals),
  }))
}
