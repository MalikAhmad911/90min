import { eq, and, asc, desc, sql, gte, lte } from 'drizzle-orm'
import { getDb } from './index'
import { competitions, teams, matches, standings, scorers, syncState } from './schema'
import type { Match, StandingsTable, Scorer, MatchStatus } from '@/lib/types'
import { RED_CARD_COLUMNS, RED_CARD_JOIN, withRedCards } from './event-queries'

/**
 * Every read the app makes.
 *
 * These return the same shapes the provider client used to return, so the
 * routes and UI did not have to change when the data moved into Postgres.
 */

interface MatchJoinRow extends Record<string, unknown> {
  id: number
  utcDate: Date
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

function toMatch(r: MatchJoinRow): Match {
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

/**
 * Raw SQL for the match joins.
 *
 * `matches` needs the teams table twice (home and away). Drizzle's query
 * builder can alias a table, but the SQL here stays easier to read - and
 * these are the hottest reads in the app, so being able to paste them
 * straight into EXPLAIN is worth something.
 */
const MATCH_COLUMNS = sql`
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

const MATCH_FROM = sql`
  from matches m
  join competitions c on c.code = m.competition_code
  join teams h on h.id = m.home_team_id
  join teams a on a.id = m.away_team_id
`

/**
 * Every match on a UTC date, in kickoff order, with red-card counts where a
 * provider reported cards (MAT-4). Hits matches_match_date_idx.
 */
export async function getMatchesByDate(date: string): Promise<Match[]> {
  const db = getDb()
  const rows = await db.execute<MatchJoinRow>(
    sql`select ${MATCH_COLUMNS}, ${RED_CARD_COLUMNS} ${MATCH_FROM} ${RED_CARD_JOIN}
        where m.match_date = ${date}::date
        order by m.utc_date asc, m.id asc`
  )
  return (rows.rows ?? (rows as unknown as MatchJoinRow[])).map((r) => withRedCards(toMatch(r), r))
}

/** One match, or null. */
export async function getMatchById(id: number): Promise<Match | null> {
  const db = getDb()
  const rows = await db.execute<MatchJoinRow>(
    sql`select ${MATCH_COLUMNS} ${MATCH_FROM} where m.id = ${id} limit 1`
  )
  const list = rows.rows ?? (rows as unknown as MatchJoinRow[])
  return list.length ? toMatch(list[0]) : null
}

/** A team's matches, oldest first. */
export async function getMatchesByTeam(teamId: number, limit = 40): Promise<Match[]> {
  const db = getDb()
  const rows = await db.execute<MatchJoinRow>(
    sql`select ${MATCH_COLUMNS} ${MATCH_FROM}
        where m.home_team_id = ${teamId} or m.away_team_id = ${teamId}
        order by m.utc_date asc
        limit ${limit}`
  )
  return (rows.rows ?? (rows as unknown as MatchJoinRow[])).map(toMatch)
}

/** Previous meetings between the two teams of a match, newest first. */
export async function getHeadToHead(matchId: number, limit = 10): Promise<Match[]> {
  const db = getDb()
  const rows = await db.execute<MatchJoinRow>(
    sql`select ${MATCH_COLUMNS} ${MATCH_FROM}
        where m.id <> ${matchId}
          and (
            (m.home_team_id, m.away_team_id) in (
              select home_team_id, away_team_id from matches where id = ${matchId}
              union all
              select away_team_id, home_team_id from matches where id = ${matchId}
            )
          )
          and m.status = 'FINISHED'
        order by m.utc_date desc
        limit ${limit}`
  )
  return (rows.rows ?? (rows as unknown as MatchJoinRow[])).map(toMatch)
}

/** League table(s) for a competition's current season. */
export async function getStandings(code: string): Promise<StandingsTable[]> {
  const db = getDb()
  const rows = await db
    .select({
      stage: standings.stage,
      type: standings.type,
      groupName: standings.groupName,
      position: standings.position,
      playedGames: standings.playedGames,
      won: standings.won,
      draw: standings.draw,
      lost: standings.lost,
      points: standings.points,
      goalsFor: standings.goalsFor,
      goalsAgainst: standings.goalsAgainst,
      goalDifference: standings.goalDifference,
      form: standings.form,
      teamId: teams.id,
      teamName: teams.name,
      teamShortName: teams.shortName,
      teamTla: teams.tla,
      teamCrest: teams.crest,
    })
    .from(standings)
    .innerJoin(teams, eq(teams.id, standings.teamId))
    .innerJoin(competitions, eq(competitions.code, standings.competitionCode))
    .where(
      and(
        eq(standings.competitionCode, code),
        // Only the season the competition is currently in.
        sql`${standings.seasonId} = ${competitions.currentSeasonId}`
      )
    )
    .orderBy(asc(standings.type), asc(standings.groupName), asc(standings.position))

  // Regroup the flat rows into one table per stage/type/group.
  const tables = new Map<string, StandingsTable>()
  for (const r of rows) {
    const key = `${r.stage}|${r.type}|${r.groupName}`
    if (!tables.has(key)) {
      tables.set(key, {
        stage: r.stage,
        type: r.type,
        group: r.groupName || null,
        table: [],
      })
    }
    tables.get(key)!.table.push({
      position: r.position,
      team: {
        id: r.teamId,
        name: r.teamName,
        shortName: r.teamShortName ?? r.teamName,
        tla: r.teamTla ?? '',
        crest: r.teamCrest ?? '',
      },
      playedGames: r.playedGames,
      form: r.form,
      won: r.won,
      draw: r.draw,
      lost: r.lost,
      points: r.points,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDifference: r.goalDifference,
    })
  }

  return [...tables.values()]
}

/** Top scorers for a competition's current season. */
export async function getScorers(code: string, limit = 20): Promise<Scorer[]> {
  const db = getDb()
  const rows = await db
    .select({
      playerId: scorers.playerId,
      playerName: scorers.playerName,
      nationality: scorers.nationality,
      position: scorers.position,
      goals: scorers.goals,
      assists: scorers.assists,
      penalties: scorers.penalties,
      playedMatches: scorers.playedMatches,
      teamId: teams.id,
      teamName: teams.name,
      teamShortName: teams.shortName,
      teamTla: teams.tla,
      teamCrest: teams.crest,
    })
    .from(scorers)
    .innerJoin(teams, eq(teams.id, scorers.teamId))
    .innerJoin(competitions, eq(competitions.code, scorers.competitionCode))
    .where(
      and(
        eq(scorers.competitionCode, code),
        sql`${scorers.seasonId} = ${competitions.currentSeasonId}`
      )
    )
    .orderBy(desc(scorers.goals), asc(scorers.playerName))
    .limit(limit)

  return rows.map((r) => ({
    player: {
      id: r.playerId,
      name: r.playerName,
      nationality: r.nationality,
      position: r.position,
    },
    team: {
      id: r.teamId,
      name: r.teamName,
      shortName: r.teamShortName ?? r.teamName,
      tla: r.teamTla ?? '',
      crest: r.teamCrest ?? '',
    },
    goals: r.goals,
    assists: r.assists,
    penalties: r.penalties,
    playedMatches: r.playedMatches ?? 0,
  }))
}

/** Does this date have anything in the database at all? */
export async function hasMatchesForDate(date: string): Promise<boolean> {
  const db = getDb()
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .where(sql`${matches.matchDate} = ${date}::date`)
  return (rows[0]?.n ?? 0) > 0
}

/** When a resource was last pulled from the provider. */
export async function getSyncState() {
  const db = getDb()
  return db
    .select()
    .from(syncState)
    .orderBy(desc(syncState.lastSuccessAt))
}

/** Dates either side of `date` that do have matches - powers "jump to next matchday". */
export async function getNearbyMatchDates(date: string, span = 10): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ d: sql<string>`to_char(${matches.matchDate}, 'YYYY-MM-DD')` })
    .from(matches)
    .where(
      and(
        gte(matches.matchDate, sql`${date}::date - ${span}`),
        lte(matches.matchDate, sql`${date}::date + ${span}`)
      )
    )
    .groupBy(matches.matchDate)
    .orderBy(asc(matches.matchDate))
  return rows.map((r) => r.d)
}
