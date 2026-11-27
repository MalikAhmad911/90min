import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from './index'

/**
 * Player and squad reads. Pure database reads: a player page never calls a
 * provider while rendering - ingestion (lib/server/sync/players.ts) fills
 * these tables in the background.
 */

/** A football-data person id from a URL segment. Rejects '1e3', '-1', '01x', etc. */
export const playerIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(2_147_483_647))

/** `?team=` for the squad endpoint. */
export const squadQuerySchema = z.object({
  team: z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(2_147_483_647)),
})

export interface PlayerTeam {
  id: number
  name: string
  shortName: string
  crest: string
}

export interface PlayerProfile {
  id: number
  name: string
  dateOfBirth: string | null
  nationality: string | null
  position: string | null
  shirtNumber: number | null
  heightCm: number | null
  /** As stored: a licensed photo URL with its credit in the fragment. */
  photoUrl: string | null
  wikidataId: string | null
  team: PlayerTeam | null
}

export interface PlayerSeasonStat {
  competitionCode: string
  competitionName: string
  seasonId: number
  seasonLabel: string | null
  teamId: number
  teamName: string
  goals: number
  assists: number | null
  penalties: number | null
  playedMatches: number | null
}

export interface PlayerMatch {
  id: number
  utcDate: string
  status: string
  competitionCode: string
  competitionName: string
  homeTeam: PlayerTeam
  awayTeam: PlayerTeam
  score: { home: number | null; away: number | null }
}

export interface PlayerPageData {
  player: PlayerProfile
  stats: PlayerSeasonStat[]
  recent: PlayerMatch[]
  upcoming: PlayerMatch[]
}

export interface SquadPlayer {
  id: number
  name: string
  position: string | null
  nationality: string | null
  dateOfBirth: string | null
  shirtNumber: number | null
}

function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] }
  return r.rows ?? (result as T[])
}

function team(id: unknown, name: string, short: string | null, crest: string | null): PlayerTeam {
  return { id: Number(id), name, shortName: short ?? name, crest: crest ?? '' }
}

export async function getPlayer(id: number): Promise<PlayerProfile | null> {
  const db = getDb()
  const rows = rowsOf<{
    id: number
    name: string
    dateOfBirth: string | null
    nationality: string | null
    position: string | null
    shirtNumber: number | null
    heightCm: number | null
    photoUrl: string | null
    wikidataId: string | null
    teamId: number | null
    teamName: string | null
    teamShort: string | null
    teamCrest: string | null
  }>(
    await db.execute(sql`
      select p.id, p.name, p.date_of_birth::text as "dateOfBirth", p.nationality, p.position,
             p.shirt_number as "shirtNumber", p.height_cm as "heightCm", p.photo_url as "photoUrl",
             p.wikidata_id as "wikidataId",
             t.id as "teamId", t.name as "teamName", t.short_name as "teamShort", t.crest as "teamCrest"
      from players p
      left join teams t on t.id = p.current_team_id
      where p.id = ${id}
      limit 1`)
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: Number(r.id),
    name: r.name,
    dateOfBirth: r.dateOfBirth,
    nationality: r.nationality,
    position: r.position,
    shirtNumber: r.shirtNumber,
    heightCm: r.heightCm,
    photoUrl: r.photoUrl,
    wikidataId: r.wikidataId,
    team: r.teamId != null && r.teamName ? team(r.teamId, r.teamName, r.teamShort, r.teamCrest) : null,
  }
}

/** Goals/assists per competition and season, newest season first. */
export async function getPlayerStats(id: number): Promise<PlayerSeasonStat[]> {
  const db = getDb()
  const rows = rowsOf<{
    competitionCode: string
    competitionName: string
    seasonId: number
    startYear: number | null
    endYear: number | null
    teamId: number
    teamName: string
    teamShort: string | null
    goals: number
    assists: number | null
    penalties: number | null
    playedMatches: number | null
  }>(
    await db.execute(sql`
      select s.competition_code as "competitionCode", c.name as "competitionName",
             s.season_id as "seasonId",
             extract(year from se.start_date)::int as "startYear",
             extract(year from se.end_date)::int as "endYear",
             t.id as "teamId", t.name as "teamName", t.short_name as "teamShort",
             s.goals, s.assists, s.penalties, s.played_matches as "playedMatches"
      from scorers s
      join competitions c on c.code = s.competition_code
      join teams t on t.id = s.team_id
      left join seasons se on se.id = s.season_id
      where s.player_id = ${id}
      order by s.season_id desc, s.goals desc`)
  )
  return rows.map((r) => ({
    competitionCode: r.competitionCode,
    competitionName: r.competitionName,
    seasonId: Number(r.seasonId),
    seasonLabel:
      r.startYear && r.endYear
        ? r.startYear === r.endYear
          ? String(r.startYear)
          : `${r.startYear}/${String(r.endYear).slice(-2)}`
        : null,
    teamId: Number(r.teamId),
    teamName: r.teamShort ?? r.teamName,
    goals: r.goals,
    assists: r.assists,
    penalties: r.penalties,
    playedMatches: r.playedMatches,
  }))
}

interface MatchRow {
  id: number
  utcDate: Date | string
  status: string
  competitionCode: string
  competitionName: string
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

function toPlayerMatch(r: MatchRow): PlayerMatch {
  return {
    id: Number(r.id),
    utcDate: new Date(r.utcDate).toISOString(),
    status: r.status,
    competitionCode: r.competitionCode,
    competitionName: r.competitionName,
    homeTeam: team(r.homeId, r.homeName, r.homeShort, r.homeCrest),
    awayTeam: team(r.awayId, r.awayName, r.awayShort, r.awayCrest),
    score: { home: r.homeScore, away: r.awayScore },
  }
}

/**
 * A team's last `limit` results and next `limit` fixtures. Two index range
 * scans (matches_home_team_idx / matches_away_team_idx) per direction.
 */
export async function getTeamRecentAndNext(
  teamId: number,
  limit = 5
): Promise<{ recent: PlayerMatch[]; upcoming: PlayerMatch[] }> {
  const db = getDb()
  const base = sql`
    select m.id, m.utc_date as "utcDate", m.status,
           c.code as "competitionCode", c.name as "competitionName",
           h.id as "homeId", h.name as "homeName", h.short_name as "homeShort", h.crest as "homeCrest",
           a.id as "awayId", a.name as "awayName", a.short_name as "awayShort", a.crest as "awayCrest",
           m.home_score_ft as "homeScore", m.away_score_ft as "awayScore"
    from matches m
    join competitions c on c.code = m.competition_code
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where (m.home_team_id = ${teamId} or m.away_team_id = ${teamId})`

  const [recent, upcoming] = await Promise.all([
    db.execute(sql`${base}
      and m.status in ('FINISHED', 'AWARDED')
      order by m.utc_date desc limit ${limit}`),
    db.execute(sql`${base}
      and m.status in ('SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED')
      and m.utc_date > now() - interval '3 hours'
      order by m.utc_date asc limit ${limit}`),
  ])

  return {
    recent: rowsOf<MatchRow>(recent).map(toPlayerMatch),
    upcoming: rowsOf<MatchRow>(upcoming).map(toPlayerMatch),
  }
}

/** Everything the player page shows, or null for an unknown player. */
export async function getPlayerPageData(id: number): Promise<PlayerPageData | null> {
  const player = await getPlayer(id)
  if (!player) return null
  const [stats, matches] = await Promise.all([
    getPlayerStats(id),
    player.team ? getTeamRecentAndNext(player.team.id) : Promise.resolve({ recent: [], upcoming: [] }),
  ])
  return { player, stats, ...matches }
}

/** A club's squad as stored, for SquadList. Ordered so shirt numbers read naturally. */
export async function getSquad(teamId: number): Promise<SquadPlayer[]> {
  const db = getDb()
  const rows = rowsOf<SquadPlayer>(
    await db.execute(sql`
      select id, name, position, nationality, date_of_birth::text as "dateOfBirth",
             shirt_number as "shirtNumber"
      from players
      where current_team_id = ${teamId}
      order by shirt_number asc nulls last, name asc`)
  )
  return rows.map((r) => ({ ...r, id: Number(r.id) }))
}
