import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { players, providerMap } from '@/lib/db/schema'
import { fresh } from '@/lib/api/football-data'
import type { SyncResult } from '@/lib/server/ingest'
import { findFootballersByName, findByQids, matchCandidate } from '@/lib/providers/wikidata'
import { findTsdbPlayer, sameClub, type TsdbPlayer } from '@/lib/providers/thesportsdb-players'

/**
 * Player ingestion: squads from football-data, the scorers we already hold,
 * and CC0/licensed enrichment from Wikidata and TheSportsDB.
 *
 * Each step comes in two forms:
 *   - `load*` does the work and throws on failure. Wrap it in ingest's
 *     `run(resource, () => load*(...))` so sync_state records the outcome
 *     and `staleResources` can schedule it.
 *   - `sync*` catches and returns a SyncResult, for direct callers.
 * Neither writes sync_state itself; that bookkeeping belongs to ingest.
 *
 * Every write is an idempotent upsert keyed on the football-data person id,
 * so two racing syncs converge on the same rows.
 */

const PROVIDER = 'football-data'
const BATCH = 200

/** National-team competitions: their squads must not overwrite a player's club. */
const NATIONAL_TEAM_COMPETITIONS = ['WC', 'EC']

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function describeError(err: unknown): string {
  const cause = (err as { cause?: unknown })?.cause
  if (cause instanceof Error && cause.message) return cause.message
  if (err instanceof Error) return err.message.split('\nparams:')[0].slice(0, 300)
  return String(err)
}

async function asResult(resource: string, work: () => Promise<number>): Promise<SyncResult> {
  try {
    return { resource, ok: true, rows: await work() }
  } catch (err) {
    return { resource, ok: false, rows: 0, error: describeError(err) }
  }
}

/** Rows of a Neon/drizzle execute() result, whichever shape the driver returns. */
function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] }
  return r.rows ?? (result as T[])
}

const nationalList = () =>
  sql.join(
    NATIONAL_TEAM_COMPETITIONS.map((c) => sql`${c}`),
    sql`, `
  )

/* ------------------------------------------------------------------ *
 * Squads
 * ------------------------------------------------------------------ */

export const teamIdSchema = z.coerce.number().int().positive().max(1_000_000_000)

const isoDate = z
  .string()
  .transform((s) => s.slice(0, 10))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

/** One squad entry as the free tier sends it. Anything malformed is skipped, not fatal. */
const squadMemberSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  position: z.string().trim().max(60).nullish(),
  dateOfBirth: isoDate.nullish().catch(null),
  nationality: z.string().trim().max(80).nullish(),
})

export function squadResourceName(teamId: number): string {
  return `squad:${teamId}`
}

/** Parses 'squad:65' back to 65, or null when the name is not a squad resource. */
export function parseSquadResource(resource: string): number | null {
  const m = /^squad:(\d{1,10})$/.exec(resource)
  if (!m) return null
  const parsed = teamIdSchema.safeParse(m[1])
  return parsed.success ? parsed.data : null
}

/**
 * Per-team squad resources, for a scheduler to spread over time (one
 * football-data request each). League clubs come first because their pages
 * get the traffic; national teams follow.
 *
 * `competition` narrows the list to one competition's current table, e.g.
 * 'PL' for twenty requests.
 */
export async function squadResources(options: { competition?: string } = {}): Promise<string[]> {
  const db = getDb()
  const code = options.competition
    ? z.string().regex(/^[A-Z0-9]{2,4}$/).parse(options.competition)
    : null

  const result = code
    ? await db.execute<{ id: number }>(sql`
        select distinct s.team_id as id
        from standings s
        join competitions c on c.code = s.competition_code
        where s.competition_code = ${code}
          and s.season_id = coalesce(c.current_season_id, s.season_id)
        order by 1`)
    : await db.execute<{ id: number }>(sql`
        select t.id
        from teams t
        order by (exists (select 1 from standings s where s.team_id = t.id)) desc, t.id`)

  return rowsOf<{ id: number }>(result).map((r) => squadResourceName(Number(r.id)))
}

/**
 * Loads one team's squad into `players`. One provider request.
 *
 * A later null never erases an earlier value (coalesce), because the free
 * tier is patchy: one payload has a date of birth, the next does not.
 */
export async function loadSquad(teamIdInput: number): Promise<number> {
  const teamId = teamIdSchema.parse(teamIdInput)
  const db = getDb()

  // players.current_team_id references teams; syncing an unknown team would
  // fail on the foreign key mid-batch, so refuse up front with a clear error.
  // A team that only ever plays World Cup / Euros fixtures is a national side:
  // its squad is still worth loading, but it must not become anyone's club.
  const teamRows = rowsOf<{ national: boolean }>(
    await db.execute<{ national: boolean }>(sql`
      select (
        exists (select 1 from matches m where m.home_team_id = t.id or m.away_team_id = t.id)
        and not exists (
          select 1 from matches m
          where (m.home_team_id = t.id or m.away_team_id = t.id)
            and m.competition_code not in (${nationalList()})
        )
      ) as national
      from teams t where t.id = ${teamId}`)
  )
  if (teamRows.length === 0) throw new Error(`Unknown team ${teamId}`)
  const national = Boolean(teamRows[0].national)

  const detail = await fresh.team(teamId)
  const squad = (Array.isArray(detail?.squad) ? detail.squad : [])
    .map((m) => squadMemberSchema.safeParse(m))
    .filter((r) => r.success)
    .map((r) => r.data)

  // The provider can list a player twice; the batch would then hit the same
  // primary key twice and Postgres rejects the whole statement.
  const unique = [...new Map(squad.map((p) => [p.id, p])).values()]
  if (unique.length === 0) return 0

  for (const part of chunk(unique, BATCH)) {
    await db
      .insert(players)
      .values(
        part.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position ?? null,
          dateOfBirth: p.dateOfBirth ?? null,
          nationality: p.nationality ?? null,
          currentTeamId: national ? null : teamId,
        }))
      )
      .onConflictDoUpdate({
        target: players.id,
        set: {
          name: sql`excluded.name`,
          position: sql`coalesce(excluded.position, ${players.position})`,
          dateOfBirth: sql`coalesce(excluded.date_of_birth, ${players.dateOfBirth})`,
          nationality: sql`coalesce(excluded.nationality, ${players.nationality})`,
          // A club squad is the authority on where a player is now; a
          // national squad (null here) leaves the club as it was.
          currentTeamId: sql`coalesce(excluded.current_team_id, ${players.currentTeamId})`,
          updatedAt: sql`now()`,
        },
      })
  }

  await mapPlayerIds(unique.map((p) => p.id))
  return unique.length
}

export function syncSquad(teamId: number): Promise<SyncResult> {
  return asResult(squadResourceName(teamId), () => loadSquad(teamId))
}

/** football-data ids are canonical, so the mapping is the identity (as ingest does for teams). */
async function mapPlayerIds(ids: number[]): Promise<void> {
  const unique = [...new Set(ids.map(String))]
  const db = getDb()
  for (const part of chunk(unique, BATCH)) {
    await db
      .insert(providerMap)
      .values(
        part.map((id) => ({ provider: PROVIDER, entityType: 'player', providerId: id, ourKey: id }))
      )
      .onConflictDoNothing()
  }
}

/* ------------------------------------------------------------------ *
 * Scorers -> players (no provider calls)
 * ------------------------------------------------------------------ */

export const SCORERS_RESOURCE = 'players:scorers'

/**
 * Every player in `scorers` gets a `players` row, so a top scorer has a
 * player page even before their club's squad has been loaded.
 *
 * One statement. The club comes only from club competitions (a World Cup
 * scorer's team is his country) and only fills a gap - a squad sync is the
 * better authority on a player's current club.
 */
export async function loadPlayersFromScorers(): Promise<number> {
  const db = getDb()
  const inserted = rowsOf<{ id: number }>(
    await db.execute<{ id: number }>(sql`
      with latest as (
        select distinct on (player_id)
          player_id, player_name, nationality, position
        from scorers
        where length(btrim(player_name)) > 0
        order by player_id, season_id desc, synced_at desc
      ),
      club as (
        select distinct on (player_id) player_id, team_id
        from scorers
        where competition_code not in (${nationalList()})
        order by player_id, season_id desc, synced_at desc
      )
      insert into players (id, name, nationality, position, current_team_id)
      select l.player_id, l.player_name, l.nationality, l.position, c.team_id
      from latest l
      left join club c on c.player_id = l.player_id
      on conflict (id) do update set
        nationality     = coalesce(players.nationality, excluded.nationality),
        position        = coalesce(players.position, excluded.position),
        current_team_id = coalesce(players.current_team_id, excluded.current_team_id)
      returning id`)
  )

  await mapPlayerIds(inserted.map((r) => Number(r.id)))
  return inserted.length
}

export function syncPlayersFromScorers(): Promise<SyncResult> {
  return asResult(SCORERS_RESOURCE, loadPlayersFromScorers)
}

/* ------------------------------------------------------------------ *
 * Enrichment: Wikidata (height, Q-id) + TheSportsDB (number, photo)
 * ------------------------------------------------------------------ */

export const ENRICH_RESOURCE = 'players:enrich'

export const enrichOptionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10),
})

// A type alias, not an interface: drizzle's execute<T> needs T to satisfy Record<string, unknown>.
type Candidate = {
  id: number
  name: string
  dateOfBirth: string
  teamName: string | null
}

/**
 * Fills height, Wikidata id, shirt number and a licensed photo for a small
 * batch of players. Cost per call: up to 2 Wikidata queries plus 2
 * TheSportsDB requests per player - so keep `limit` small and call often.
 *
 * Players without a date of birth are skipped: without it a name match could
 * attach a namesake's height or face to the wrong person.
 *
 * Candidates rotate by `updated_at`, which every attempt bumps, so a player
 * no source knows about does not block the rest of the table.
 */
export async function loadEnrichment(options: { limit?: number } = {}): Promise<number> {
  const { limit } = enrichOptionsSchema.parse(options)
  const db = getDb()

  const candidates = rowsOf<Candidate>(
    await db.execute<Candidate>(sql`
      select p.id, p.name, p.date_of_birth::text as "dateOfBirth", t.name as "teamName"
      from players p
      left join teams t on t.id = p.current_team_id
      where p.date_of_birth is not null
        and (p.wikidata_id is null or p.height_cm is null
             or p.shirt_number is null or p.photo_url is null)
      order by p.updated_at asc, p.id asc
      limit ${limit}`)
  ).map((c) => ({ ...c, id: Number(c.id) }))
  if (candidates.length === 0) return 0

  // 1. Wikidata by name, one batched query. A failure here must not stop
  //    TheSportsDB from contributing, so it degrades to "no matches".
  const byName = await findFootballersByName(candidates.map((c) => c.name)).catch(() => [])
  const wikidata = new Map(candidates.map((c) => [c.id, matchCandidate(c, byName)] as const))

  // 2. TheSportsDB, one player at a time through its own rate limiter.
  const tsdb = new Map<number, TsdbPlayer | null>()
  for (const c of candidates) {
    tsdb.set(c.id, await findTsdbPlayer(c).catch(() => null))
  }

  // 3. Players Wikidata could not find by label but TheSportsDB links to a
  //    Q-id: look those items up, still insisting on the date of birth.
  const viaTsdb = candidates.filter((c) => !wikidata.get(c.id) && tsdb.get(c.id)?.wikidataId)
  if (viaTsdb.length > 0) {
    const byId = await findByQids(viaTsdb.map((c) => tsdb.get(c.id)!.wikidataId!)).catch(() => [])
    for (const c of viaTsdb) {
      const qid = tsdb.get(c.id)!.wikidataId
      const hit = matchCandidate(
        c,
        byId.filter((b) => b.qid === qid),
        // The id link already ties the item to this person, and the label may
        // be another spelling ("Rodrigo" vs "Rodri"). The DOB is still required.
        { requireName: false }
      )
      if (hit) wikidata.set(c.id, hit)
    }
  }

  let touched = 0
  for (const c of candidates) {
    const wd = wikidata.get(c.id) ?? null
    const ts = tsdb.get(c.id) ?? null
    const height = wd?.heightCm ?? ts?.heightCm ?? null
    // A number from TheSportsDB only counts if it is for the same club - a
    // national-team number on a club page would be wrong.
    const shirt = ts && sameClub(ts.team, c.teamName) ? ts.shirtNumber : null
    const tsAnswered = ts !== null

    // When TheSportsDB answered, its licence flag is the current truth: a
    // photo whose licence no longer allows display is removed, not kept.
    await db.execute(sql`
      update players set
        height_cm    = coalesce(height_cm, ${height}::int),
        wikidata_id  = coalesce(wikidata_id, ${wd?.qid ?? null}::text),
        shirt_number = coalesce(${shirt}::int, shirt_number),
        photo_url    = case when ${tsAnswered}::boolean then ${ts?.photoUrl ?? null}::text else photo_url end,
        updated_at   = now()
      where id = ${c.id}`)

    if (wd) await mapExternal('wikidata', wd.qid, c.id)
    if (ts) await mapExternal('thesportsdb', ts.idPlayer, c.id)
    touched++
  }

  return touched
}

export function enrichPlayers(options: { limit?: number } = {}): Promise<SyncResult> {
  return asResult(ENRICH_RESOURCE, () => loadEnrichment(options))
}

async function mapExternal(provider: 'wikidata' | 'thesportsdb', providerId: string, ourId: number) {
  await getDb()
    .insert(providerMap)
    .values({ provider, entityType: 'player', providerId, ourKey: String(ourId) })
    .onConflictDoNothing()
}
