import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  competitions,
  teams,
  matches,
  standings,
  scorers,
  syncState,
} from '@/lib/db/schema'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import {
  fetchMatchesByDate,
  fetchCompetitionMatches,
  fetchStandings,
  fetchScorers,
} from '@/lib/api/football-data'
import type { Match, CompetitionStandings, Scorer } from '@/lib/types'

/**
 * Writes provider data into Postgres.
 *
 * Everything here is an upsert keyed on the provider's own ids, so running a
 * sync twice is a no-op rather than a duplicate. That matters because syncs
 * are triggered by whoever happens to load a stale page - two visitors can
 * easily race, and the second one must not corrupt what the first wrote.
 *
 * Rows go in as multi-row statements. The Neon HTTP driver makes one network
 * round trip per statement, so inserting a 380-match season one row at a time
 * would mean 380 round trips; batching makes it two.
 */

/** Rows per INSERT. Large enough to be few trips, small enough to stay under statement limits. */
const BATCH = 200

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/* ------------------------------------------------------------------ *
 * Upserts
 * ------------------------------------------------------------------ */

/** Seeds the competition catalogue. Safe to call repeatedly. */
export async function ensureCompetitions(): Promise<void> {
  const db = getDb()
  await db
    .insert(competitions)
    .values(
      FREE_COMPETITIONS.map((c) => ({
        code: c.code,
        externalId: c.id,
        name: c.name,
        shortName: c.shortName,
        country: c.country,
        flag: c.flag,
        emblem: c.emblem,
      }))
    )
    .onConflictDoUpdate({
      target: competitions.code,
      set: {
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        country: sql`excluded.country`,
        flag: sql`excluded.flag`,
        emblem: sql`excluded.emblem`,
        updatedAt: sql`now()`,
      },
    })
}

/**
 * Teams come to us embedded in matches and tables rather than as their own
 * feed, so we harvest them from whatever we are already ingesting. Matches
 * carry a foreign key to teams, which means this must run first.
 */
async function upsertTeams(
  rows: { id: number; name: string; shortName?: string | null; tla?: string | null; crest?: string | null }[]
): Promise<void> {
  const unique = new Map<number, (typeof rows)[number]>()
  for (const r of rows) {
    if (r && Number.isInteger(r.id)) unique.set(r.id, r)
  }
  if (unique.size === 0) return

  const db = getDb()
  for (const part of chunk([...unique.values()], BATCH)) {
    await db
      .insert(teams)
      .values(
        part.map((t) => ({
          id: t.id,
          name: t.name,
          shortName: t.shortName ?? null,
          tla: t.tla ?? null,
          crest: t.crest ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: teams.id,
        set: {
          name: sql`excluded.name`,
          shortName: sql`excluded.short_name`,
          tla: sql`excluded.tla`,
          // Never overwrite a crest we have with a null we just received.
          crest: sql`coalesce(excluded.crest, ${teams.crest})`,
          updatedAt: sql`now()`,
        },
      })
  }
}

/** Upserts matches (and the teams they reference). Returns rows written. */
export async function upsertMatches(list: Match[]): Promise<number> {
  const known = new Set(FREE_COMPETITIONS.map((c) => c.code))
  // A match in a competition we do not carry would violate the foreign key.
  const usable = list.filter((m) => known.has(m.competition.code))
  if (usable.length === 0) return 0

  await upsertTeams(usable.flatMap((m) => [m.homeTeam, m.awayTeam]))

  const db = getDb()
  for (const part of chunk(usable, BATCH)) {
    await db
      .insert(matches)
      .values(
        part.map((m) => ({
          id: m.id,
          competitionCode: m.competition.code,
          utcDate: new Date(m.utcDate),
          status: m.status,
          minute: m.minute ?? null,
          stage: m.stage ?? null,
          groupName: m.group ?? '',
          homeTeamId: m.homeTeam.id,
          awayTeamId: m.awayTeam.id,
          homeScoreFt: m.score.fullTime.home,
          awayScoreFt: m.score.fullTime.away,
          homeScoreHt: m.score.halfTime.home,
          awayScoreHt: m.score.halfTime.away,
        }))
      )
      .onConflictDoUpdate({
        target: matches.id,
        set: {
          status: sql`excluded.status`,
          minute: sql`excluded.minute`,
          utcDate: sql`excluded.utc_date`,
          stage: sql`excluded.stage`,
          groupName: sql`excluded.group_name`,
          homeScoreFt: sql`excluded.home_score_ft`,
          awayScoreFt: sql`excluded.away_score_ft`,
          homeScoreHt: sql`excluded.home_score_ht`,
          awayScoreHt: sql`excluded.away_score_ht`,
          syncedAt: sql`now()`,
        },
      })
  }

  return usable.length
}

async function upsertStandings(code: string, payload: CompetitionStandings): Promise<number> {
  const seasonId = payload.season?.id
  if (!seasonId || !payload.standings?.length) return 0

  await upsertTeams(payload.standings.flatMap((t) => t.table.map((r) => r.team)))

  const db = getDb()
  const rows = payload.standings.flatMap((table) =>
    table.table.map((r) => ({
      competitionCode: code,
      seasonId,
      stage: table.stage ?? 'REGULAR_SEASON',
      type: table.type ?? 'TOTAL',
      groupName: table.group ?? '',
      teamId: r.team.id,
      position: r.position,
      playedGames: r.playedGames ?? 0,
      won: r.won ?? 0,
      draw: r.draw ?? 0,
      lost: r.lost ?? 0,
      points: r.points ?? 0,
      goalsFor: r.goalsFor ?? 0,
      goalsAgainst: r.goalsAgainst ?? 0,
      goalDifference: r.goalDifference ?? 0,
      form: r.form ?? null,
    }))
  )
  if (rows.length === 0) return 0

  for (const part of chunk(rows, BATCH)) {
    await db
      .insert(standings)
      .values(part)
      .onConflictDoUpdate({
        target: [
          standings.competitionCode,
          standings.seasonId,
          standings.stage,
          standings.type,
          standings.groupName,
          standings.teamId,
        ],
        set: {
          position: sql`excluded.position`,
          playedGames: sql`excluded.played_games`,
          won: sql`excluded.won`,
          draw: sql`excluded.draw`,
          lost: sql`excluded.lost`,
          points: sql`excluded.points`,
          goalsFor: sql`excluded.goals_for`,
          goalsAgainst: sql`excluded.goals_against`,
          goalDifference: sql`excluded.goal_difference`,
          form: sql`excluded.form`,
          syncedAt: sql`now()`,
        },
      })
  }

  // Remember which season this competition is currently in.
  await db
    .update(competitions)
    .set({ currentSeasonId: seasonId, currentMatchday: payload.season?.currentMatchday ?? null })
    .where(sql`${competitions.code} = ${code}`)

  return rows.length
}

async function upsertScorers(code: string, seasonId: number, list: Scorer[]): Promise<number> {
  if (!list.length || !seasonId) return 0

  await upsertTeams(list.map((s) => s.team))

  // The provider can repeat a player across entries; the primary key would
  // reject the batch, so collapse to the highest-scoring row per player.
  const byPlayer = new Map<number, Scorer>()
  for (const s of list) {
    const existing = byPlayer.get(s.player.id)
    if (!existing || (s.goals ?? 0) > (existing.goals ?? 0)) byPlayer.set(s.player.id, s)
  }

  const db = getDb()
  const rows = [...byPlayer.values()].map((s) => ({
    competitionCode: code,
    seasonId,
    playerId: s.player.id,
    playerName: s.player.name,
    nationality: s.player.nationality ?? null,
    position: s.player.position ?? null,
    teamId: s.team.id,
    goals: s.goals ?? 0,
    assists: s.assists ?? null,
    penalties: s.penalties ?? null,
    playedMatches: s.playedMatches ?? null,
  }))

  for (const part of chunk(rows, BATCH)) {
    await db
      .insert(scorers)
      .values(part)
      .onConflictDoUpdate({
        target: [scorers.competitionCode, scorers.seasonId, scorers.playerId],
        set: {
          playerName: sql`excluded.player_name`,
          teamId: sql`excluded.team_id`,
          goals: sql`excluded.goals`,
          assists: sql`excluded.assists`,
          penalties: sql`excluded.penalties`,
          playedMatches: sql`excluded.played_matches`,
          syncedAt: sql`now()`,
        },
      })
  }

  return rows.length
}

/* ------------------------------------------------------------------ *
 * Sync bookkeeping
 * ------------------------------------------------------------------ */

async function recordAttempt(resource: string): Promise<void> {
  const db = getDb()
  await db
    .insert(syncState)
    .values({ resource, lastAttemptAt: new Date() })
    .onConflictDoUpdate({
      target: syncState.resource,
      set: { lastAttemptAt: sql`now()` },
    })
}

async function recordSuccess(resource: string, rows: number): Promise<void> {
  const db = getDb()
  await db
    .insert(syncState)
    .values({
      resource,
      lastAttemptAt: new Date(),
      lastSuccessAt: new Date(),
      rowsWritten: rows,
      consecutiveFailures: 0,
    })
    .onConflictDoUpdate({
      target: syncState.resource,
      set: {
        lastAttemptAt: sql`now()`,
        lastSuccessAt: sql`now()`,
        rowsWritten: sql`excluded.rows_written`,
        lastError: sql`null`,
        consecutiveFailures: sql`0`,
      },
    })
}

async function recordFailure(resource: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const db = getDb()
  await db
    .insert(syncState)
    .values({
      resource,
      lastAttemptAt: new Date(),
      lastError: message.slice(0, 500),
      consecutiveFailures: 1,
    })
    .onConflictDoUpdate({
      target: syncState.resource,
      set: {
        lastAttemptAt: sql`now()`,
        lastError: sql`excluded.last_error`,
        consecutiveFailures: sql`${syncState.consecutiveFailures} + 1`,
      },
    })
}

/**
 * Postgres driver errors put the useful part (constraint name, detail) on the
 * cause, and the entire SQL statement in the message. Lead with the cause.
 */
function describeError(err: unknown): string {
  const cause = (err as { cause?: unknown })?.cause
  if (cause instanceof Error && cause.message) return cause.message
  if (err instanceof Error) {
    const detail = (err as unknown as { detail?: string }).detail
    if (detail) return detail
    // Drop the bound-parameter dump; keep the statement's first lines.
    return err.message.split('\nparams:')[0].slice(0, 300)
  }
  return String(err)
}

/** Runs one sync step, recording the outcome either way. */
async function run(resource: string, work: () => Promise<number>): Promise<SyncResult> {
  await recordAttempt(resource)
  try {
    const rows = await work()
    await recordSuccess(resource, rows)
    return { resource, ok: true, rows }
  } catch (err) {
    await recordFailure(resource, err)
    return { resource, ok: false, rows: 0, error: describeError(err) }
  }
}

export interface SyncResult {
  resource: string
  ok: boolean
  rows: number
  error?: string
}

/* ------------------------------------------------------------------ *
 * Sync steps
 * ------------------------------------------------------------------ */

/** Today's and tomorrow's matches - one upstream request, carries live scores. */
export function syncLiveWindow(): Promise<SyncResult> {
  return run('live-window', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { value } = await fetchMatchesByDate(today)
    return upsertMatches(value)
  })
}

/** A competition's whole season of fixtures - one request, every date covered. */
export function syncSeason(code: string): Promise<SyncResult> {
  return run(`season:${code}`, async () => {
    const { value } = await fetchCompetitionMatches(code)
    return upsertMatches(value)
  })
}

export function syncStandings(code: string): Promise<SyncResult> {
  return run(`standings:${code}`, async () => {
    const { value } = await fetchStandings(code)
    return upsertStandings(code, value)
  })
}

export function syncScorers(code: string): Promise<SyncResult> {
  return run(`scorers:${code}`, async () => {
    const { value } = await fetchScorers(code, 30)
    // The scorers payload does not always carry the season, so fall back to
    // whatever the last standings sync recorded for this competition.
    const stored = await getDb()
      .select({ id: competitions.currentSeasonId })
      .from(competitions)
      .where(sql`${competitions.code} = ${code}`)
    const seasonId = value.competition?.currentSeason?.id ?? stored[0]?.id ?? 0
    return upsertScorers(code, seasonId, value.scorers ?? [])
  })
}

/**
 * Which resources are stale enough to be worth a provider call.
 *
 * Deliberately conservative: the provider allows ten requests a minute, so a
 * sync run picks a small number of the stalest things rather than trying to
 * refresh everything at once.
 */
export async function staleResources(limit = 4): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ resource: syncState.resource, lastSuccessAt: syncState.lastSuccessAt })
    .from(syncState)

  const seen = new Map(rows.map((r) => [r.resource, r.lastSuccessAt]))
  const now = Date.now()
  const candidates: { resource: string; age: number }[] = []

  const add = (resource: string, maxAgeMs: number) => {
    const last = seen.get(resource)
    const age = last ? now - new Date(last).getTime() : Infinity
    if (age > maxAgeMs) candidates.push({ resource, age })
  }

  add('live-window', 60_000)
  for (const c of FREE_COMPETITIONS) {
    add(`season:${c.code}`, 6 * 60 * 60_000)
    add(`standings:${c.code}`, 6 * 60 * 60_000)
    add(`scorers:${c.code}`, 24 * 60 * 60_000)
  }

  // Stalest first, so nothing is starved.
  candidates.sort((a, b) => b.age - a.age)
  return candidates.slice(0, limit).map((c) => c.resource)
}

/**
 * Runs one named sync step.
 *
 * Seeds the competition catalogue first. Matches, standings and scorers all
 * carry a foreign key to `competitions`, so syncing any of them against an
 * empty catalogue fails the whole batch - which is exactly what happens when
 * a single resource is synced directly rather than through `runSync`.
 */
export async function syncResource(resource: string): Promise<SyncResult> {
  await ensureCompetitions()

  if (resource === 'live-window') return syncLiveWindow()
  const [kind, code] = resource.split(':')
  if (kind === 'season') return syncSeason(code)
  if (kind === 'standings') return syncStandings(code)
  if (kind === 'scorers') return syncScorers(code)
  return { resource, ok: false, rows: 0, error: 'Unknown resource' }
}

/** One pass of the ingestion job. */
export async function runSync(limit = 4): Promise<SyncResult[]> {
  await ensureCompetitions()
  const due = await staleResources(limit)
  const results: SyncResult[] = []
  // Sequential on purpose: the provider rate limiter would serialise these
  // anyway, and doing it here keeps the failure output readable.
  for (const resource of due) {
    results.push(await syncResource(resource))
  }
  return results
}
