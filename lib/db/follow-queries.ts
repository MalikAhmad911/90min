import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { getDb } from './index'
import { follows, FOLLOWABLE } from './schema'
import { MATCH_COLUMNS, MATCH_FROM, rowsOf, toMatch, type MatchJoinRow } from './home-queries'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import type { Match } from '@/lib/types'

/**
 * Reads and writes for device follows (PRD MAT-2, ON-1).
 *
 * Callers pass values already validated by app/api/follows/schema.ts; these
 * functions still bind every value as a parameter and build the stored
 * `notify` object key by key, so nothing a client sent is written verbatim.
 */

export type FollowEntityType = (typeof FOLLOWABLE)[number]

export interface FollowRecord {
  entityType: FollowEntityType
  entityKey: string
  notify: Record<string, boolean>
  createdAt: string
}

const NOTIFY_KEYS = ['goals', 'kickoff', 'halfTime', 'fullTime', 'redCards', 'lineups'] as const

/** Copies only the allow-listed boolean toggles. */
function cleanNotify(notify: Partial<Record<string, unknown>> | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!notify) return out
  for (const key of NOTIFY_KEYS) {
    const value = notify[key]
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}

function toRecord(row: {
  entityType: string
  entityKey: string
  notify: unknown
  createdAt: Date | string
}): FollowRecord {
  return {
    entityType: row.entityType as FollowEntityType,
    entityKey: row.entityKey,
    notify: cleanNotify((row.notify ?? {}) as Record<string, unknown>),
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

const FOLLOW_FIELDS = {
  entityType: follows.entityType,
  entityKey: follows.entityKey,
  notify: follows.notify,
  createdAt: follows.createdAt,
}

/** This device's follows, oldest first. Served by the primary key's prefix. */
export async function listFollows(deviceId: string): Promise<FollowRecord[]> {
  const db = getDb()
  const rows = await db
    .select(FOLLOW_FIELDS)
    .from(follows)
    .where(eq(follows.deviceId, deviceId))
    .orderBy(asc(follows.createdAt), asc(follows.entityType), asc(follows.entityKey))
  return rows.map(toRecord)
}

async function findFollow(
  deviceId: string,
  entityType: FollowEntityType,
  entityKey: string
): Promise<FollowRecord | null> {
  const db = getDb()
  const rows = await db
    .select(FOLLOW_FIELDS)
    .from(follows)
    .where(
      and(
        eq(follows.deviceId, deviceId),
        eq(follows.entityType, entityType),
        eq(follows.entityKey, entityKey)
      )
    )
    .limit(1)
  return rows[0] ? toRecord(rows[0]) : null
}

/**
 * Does the followed thing exist? Following a typo'd id would create a row the
 * notifier can never match and the Following page can never render.
 */
export async function entityExists(entityType: FollowEntityType, entityKey: string): Promise<boolean> {
  const db = getDb()
  let query: SQL
  switch (entityType) {
    case 'team':
      query = sql`select 1 from teams where id = ${Number(entityKey)} limit 1`
      break
    case 'match':
      query = sql`select 1 from matches where id = ${Number(entityKey)} limit 1`
      break
    case 'competition':
      query = sql`select 1 from competitions where code = ${entityKey} limit 1`
      break
    case 'player':
      // The players table is filled lazily; scorers is the other place a
      // player id is known to be real.
      query = sql`select 1 where exists (select 1 from players where id = ${Number(entityKey)})
                     or exists (select 1 from scorers where player_id = ${Number(entityKey)})`
      break
    default:
      return false
  }
  const result = await db.execute(query)
  return rowsOf<unknown>(result).length > 0
}

export type UpsertResult =
  | { status: 'created' | 'updated' | 'unchanged'; follow: FollowRecord }
  | { status: 'limit' }

/**
 * Follows an entity, idempotently.
 *
 * - Already followed: notify toggles in the request are merged into the
 *   stored ones (a partial update); with none, nothing is written.
 * - Not followed: inserted only while the device is under `cap`. The count
 *   and the insert are one statement, so the cap holds against everything
 *   except truly simultaneous requests from the same device, which can
 *   overshoot by at most a few rows - fine for a storage bound.
 */
export async function upsertFollow(
  deviceId: string,
  input: { entityType: FollowEntityType; entityKey: string; notify?: Record<string, unknown> },
  cap: number
): Promise<UpsertResult> {
  const db = getDb()
  const notify = cleanNotify(input.notify)
  const hasNotify = Object.keys(notify).length > 0
  const where = and(
    eq(follows.deviceId, deviceId),
    eq(follows.entityType, input.entityType),
    eq(follows.entityKey, input.entityKey)
  )

  const existing = await findFollow(deviceId, input.entityType, input.entityKey)
  if (existing) {
    if (!hasNotify) return { status: 'unchanged', follow: existing }
    const rows = await db
      .update(follows)
      .set({ notify: sql`${follows.notify} || ${JSON.stringify(notify)}::jsonb` })
      .where(where)
      .returning(FOLLOW_FIELDS)
    return { status: 'updated', follow: rows[0] ? toRecord(rows[0]) : existing }
  }

  const inserted = await db.execute<{
    entityType: string
    entityKey: string
    notify: unknown
    createdAt: string
  }>(
    sql`insert into follows (device_id, entity_type, entity_key, notify)
        select ${deviceId}, ${input.entityType}, ${input.entityKey}, ${JSON.stringify(notify)}::jsonb
        where (select count(*) from follows where device_id = ${deviceId}) < ${cap}
        on conflict (device_id, entity_type, entity_key) do nothing
        returning entity_type as "entityType", entity_key as "entityKey", notify, created_at as "createdAt"`
  )
  const row = rowsOf<{ entityType: string; entityKey: string; notify: unknown; createdAt: string }>(
    inserted
  )[0]
  if (row) return { status: 'created', follow: toRecord(row) }

  // Nothing inserted: either a concurrent request won the race (the row now
  // exists - treat it as success) or the device is at its cap.
  const raced = await findFollow(deviceId, input.entityType, input.entityKey)
  if (raced) return { status: 'unchanged', follow: raced }
  return { status: 'limit' }
}

/** Unfollows. Returns whether a row was removed; removing nothing is not an error. */
export async function deleteFollow(
  deviceId: string,
  entityType: FollowEntityType,
  entityKey: string
): Promise<boolean> {
  const db = getDb()
  const rows = await db
    .delete(follows)
    .where(
      and(
        eq(follows.deviceId, deviceId),
        eq(follows.entityType, entityType),
        eq(follows.entityKey, entityKey)
      )
    )
    .returning({ entityKey: follows.entityKey })
  return rows.length > 0
}

/* ------------------------------------------------------------------ *
 * Following page / sidebar summary
 * ------------------------------------------------------------------ */

export interface FollowedTeam {
  id: number
  name: string
  shortName: string
  crest: string
  /** Null for a team id that is no longer in the database; still unfollowable. */
  found: boolean
  nextMatch: Match | null
}

export interface FollowedCompetition {
  code: string
  name: string
  emblem: string
  country: string
  nextMatch: Match | null
}

export interface FollowedPlayer {
  id: number
  name: string
  teamId: number | null
  teamName: string | null
  nextMatch: Match | null
}

export interface FollowSummary {
  teams: FollowedTeam[]
  competitions: FollowedCompetition[]
  players: FollowedPlayer[]
  matches: Match[]
}

/** Statuses for which a match is still "next" rather than history. */
const UPCOMING = sql`('SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED')`

function valuesList(values: (number | string)[], cast: SQL): SQL {
  return sql.join(
    values.map((v) => sql`(${v}${cast})`),
    sql`, `
  )
}

/**
 * The next (or live) match for each team id, one lateral lookup per team so
 * each uses the matches_home_team_idx / matches_away_team_idx indexes. The
 * one-day look-back keeps a match that is in play right now.
 */
async function nextMatchByTeam(teamIds: number[]): Promise<Map<number, Match>> {
  const out = new Map<number, Match>()
  if (teamIds.length === 0) return out
  const db = getDb()
  const result = await db.execute<MatchJoinRow & { forTeam: number }>(
    sql`select t.team_id as "forTeam", ${MATCH_COLUMNS}
        from (values ${valuesList(teamIds, sql`::int`)}) as t(team_id)
        cross join lateral (
          select * from matches mm
          where (mm.home_team_id = t.team_id or mm.away_team_id = t.team_id)
            and mm.status in ${UPCOMING}
            and mm.utc_date > now() - interval '1 day'
          order by mm.utc_date asc
          limit 1
        ) m
        join competitions c on c.code = m.competition_code
        join teams h on h.id = m.home_team_id
        join teams a on a.id = m.away_team_id`
  )
  for (const row of rowsOf<MatchJoinRow & { forTeam: number }>(result)) {
    out.set(Number(row.forTeam), toMatch(row))
  }
  return out
}

async function nextMatchByCompetition(codes: string[]): Promise<Map<string, Match>> {
  const out = new Map<string, Match>()
  if (codes.length === 0) return out
  const db = getDb()
  const result = await db.execute<MatchJoinRow & { forCode: string }>(
    sql`select x.code as "forCode", ${MATCH_COLUMNS}
        from (values ${valuesList(codes, sql`::text`)}) as x(code)
        cross join lateral (
          select * from matches mm
          where mm.competition_code = x.code
            and mm.status in ${UPCOMING}
            and mm.utc_date > now() - interval '1 day'
          order by mm.utc_date asc
          limit 1
        ) m
        join competitions c on c.code = m.competition_code
        join teams h on h.id = m.home_team_id
        join teams a on a.id = m.away_team_id`
  )
  for (const row of rowsOf<MatchJoinRow & { forCode: string }>(result)) {
    out.set(String(row.forCode), toMatch(row))
  }
  return out
}

/** Everything the Following page and the sidebar show for one device. */
export async function getFollowSummary(deviceId: string): Promise<FollowSummary> {
  const all = await listFollows(deviceId)
  const ids = (type: FollowEntityType) =>
    all.filter((f) => f.entityType === type).map((f) => Number(f.entityKey))
  const teamIds = ids('team')
  const playerIds = ids('player')
  const matchIds = ids('match')
  const codes = all.filter((f) => f.entityType === 'competition').map((f) => f.entityKey)
  const db = getDb()

  // Players: name and club from players, falling back to the scorers table.
  let players: { id: number; name: string; teamId: number | null; teamName: string | null }[] = []
  if (playerIds.length > 0) {
    const result = await db.execute<{
      id: number
      name: string | null
      teamId: number | null
      teamName: string | null
    }>(
      sql`select p.id, coalesce(pl.name, sc.player_name) as name,
                 coalesce(pl.current_team_id, sc.team_id) as "teamId", t.name as "teamName"
          from (values ${valuesList(playerIds, sql`::int`)}) as p(id)
          left join players pl on pl.id = p.id
          left join lateral (
            select player_name, team_id from scorers s
            where s.player_id = p.id order by s.synced_at desc limit 1
          ) sc on true
          left join teams t on t.id = coalesce(pl.current_team_id, sc.team_id)`
    )
    players = rowsOf<{ id: number; name: string | null; teamId: number | null; teamName: string | null }>(
      result
    ).map((r) => ({
      id: Number(r.id),
      name: r.name ?? `Player ${r.id}`,
      teamId: r.teamId === null ? null : Number(r.teamId),
      teamName: r.teamName,
    }))
  }

  const nextTeamIds = [
    ...new Set([...teamIds, ...players.flatMap((p) => (p.teamId ? [p.teamId] : []))]),
  ]

  const [teamRows, nextByTeam, nextByCode, matchRows] = await Promise.all([
    teamIds.length > 0
      ? db.execute<{ id: number; name: string; shortName: string | null; crest: string | null }>(
          sql`select id, name, short_name as "shortName", crest from teams
              where id in (${sql.join(teamIds.map((id) => sql`${id}`), sql`, `)})`
        )
      : Promise.resolve([]),
    nextMatchByTeam(nextTeamIds),
    nextMatchByCompetition(codes),
    matchIds.length > 0
      ? db.execute<MatchJoinRow>(
          sql`select ${MATCH_COLUMNS} ${MATCH_FROM}
              where m.id in (${sql.join(matchIds.map((id) => sql`${id}`), sql`, `)})
              order by m.utc_date asc`
        )
      : Promise.resolve([]),
  ])

  const teamById = new Map(
    rowsOf<{ id: number; name: string; shortName: string | null; crest: string | null }>(teamRows).map(
      (t) => [Number(t.id), t]
    )
  )

  return {
    teams: teamIds.map((id) => {
      const t = teamById.get(id)
      return {
        id,
        name: t?.name ?? `Team ${id}`,
        shortName: t?.shortName ?? t?.name ?? `Team ${id}`,
        crest: t?.crest ?? '',
        found: Boolean(t),
        nextMatch: nextByTeam.get(id) ?? null,
      }
    }),
    competitions: codes.map((code) => {
      const meta = FREE_COMPETITIONS.find((c) => c.code === code)
      return {
        code,
        name: meta?.name ?? code,
        emblem: meta?.emblem ?? '',
        country: meta?.country ?? '',
        nextMatch: nextByCode.get(code) ?? null,
      }
    }),
    players: players.map((p) => ({
      ...p,
      nextMatch: p.teamId ? nextByTeam.get(p.teamId) ?? null : null,
    })),
    matches: rowsOf<MatchJoinRow>(matchRows).map(toMatch),
  }
}

/* ------------------------------------------------------------------ *
 * Onboarding catalogue
 * ------------------------------------------------------------------ */

export interface CatalogTeam {
  id: number
  name: string
  shortName: string
  crest: string
}

/**
 * Teams per competition code, derived from the fixtures we hold: the
 * provider's team lists are not stored separately, and a team with fixtures
 * is exactly a team worth following.
 */
export async function getTeamsByCompetition(): Promise<Record<string, CatalogTeam[]>> {
  const db = getDb()
  const result = await db.execute<{
    code: string
    id: number
    name: string
    shortName: string | null
    crest: string | null
  }>(
    sql`select x.code, t.id, t.name, t.short_name as "shortName", t.crest
        from (
          select competition_code as code, home_team_id as team_id from matches
          union
          select competition_code, away_team_id from matches
        ) x
        join teams t on t.id = x.team_id
        order by x.code, t.name`
  )
  const out: Record<string, CatalogTeam[]> = {}
  for (const r of rowsOf<{ code: string; id: number; name: string; shortName: string | null; crest: string | null }>(
    result
  )) {
    ;(out[r.code] ??= []).push({
      id: Number(r.id),
      name: r.name,
      shortName: r.shortName ?? r.name,
      crest: r.crest ?? '',
    })
  }
  return out
}
