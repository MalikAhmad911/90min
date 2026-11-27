import { and, eq, notInArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { matchDetails, matchEvents } from '@/lib/db/schema'
import type { SyncResult } from '@/lib/server/ingest'
import {
  BudgetExhaustedError,
  createHighlightlyClient,
  isHighlightlyConfigured,
  type HighlightlyClient,
} from '@/lib/providers/highlightly/client'
import { HIGHLIGHTLY_LEAGUES, highlightlyLeague } from '@/lib/providers/highlightly/leagues'
import {
  isFinishedState,
  normaliseLineups,
  normaliseStatistics,
  planEventRows,
  refereeName,
  type HlListMatch,
} from '@/lib/providers/highlightly/parse'
import { matchTeam } from '@/lib/providers/openligadb'
import { matchFixture } from '@/lib/server/sync/openligadb'
import { competitionTeams, insertMappings, loadMappings, ourMatches } from '@/lib/server/sync/provider-map'
import {
  chunk,
  describeError,
  isUndefinedTable,
  readMarker,
  recordState,
  rowsOf,
  writeMarker,
} from '@/lib/server/sync/sync-state'

/**
 * Fills match_details (lineups, statistics) and match_events (timeline) from
 * Highlightly's free plan: 100 requests a day, so every request is chosen.
 *
 * Per pass (at most one every 10 minutes):
 *   1. Pick our matches worth fetching: finished in the last 3 days and not yet
 *      final, then live ones not refreshed for 15 minutes (only while more than
 *      40 requests remain today). Top leagues first.
 *   2. Map each to a Highlightly id: one list call per league-day, teams by
 *      exact normalised name among that competition's teams, fixture by teams
 *      plus kick-off. Unmapped matches are skipped, never guessed.
 *   3. One detail call (events + statistics), plus one lineups call the first
 *      time. A finished match is marked final and never fetched again.
 */

const PROVIDER = 'highlightly'
const RESOURCE = 'highlightly'
const PASS_MARKER = 'highlightly:pass'
const MIN_PASS_INTERVAL_MS = 10 * 60_000
const LIVE_REFRESH_MS = 15 * 60_000
const LIVE_MIN_REMAINING = 40
const FINISHED_LOOKBACK_MS = 3 * 24 * 60 * 60_000
const MAX_MATCHES_PER_PASS = 12
/** Mapping list calls per pass; mappings persist, so later passes need few. */
const MAX_LIST_CALLS_PER_PASS = 6
const BATCH = 200

interface Candidate {
  id: number
  code: string
  utcDate: Date
  status: string
  homeTeamId: number
  awayTeamId: number
  homeScoreFt: number | null
  awayScoreFt: number | null
  hasLineups: boolean
}

const TIER = new Map(HIGHLIGHTLY_LEAGUES.map((l) => [l.code, l.tier]))

async function loadCandidates(now: Date, remaining: number): Promise<Candidate[]> {
  const codes = HIGHLIGHTLY_LEAGUES.map((l) => l.code)
  const since = new Date(now.getTime() - FINISHED_LOOKBACK_MS).toISOString()
  const liveCutoff = new Date(now.getTime() - LIVE_REFRESH_MS).toISOString()
  const rows = rowsOf(
    await getDb().execute(sql`
      select m.id, m.competition_code as code, m.utc_date as "utcDate", m.status,
             m.home_team_id as "homeTeamId", m.away_team_id as "awayTeamId",
             m.home_score_ft as "homeScoreFt", m.away_score_ft as "awayScoreFt",
             (d.lineups is not null) as "hasLineups"
      from matches m
      left join match_details d on d.match_id = m.id
      where m.competition_code in (${sql.join(codes.map((c) => sql`${c}`), sql`, `)})
        and coalesce(d.is_final, false) = false
        and (
          (m.status = 'FINISHED' and m.utc_date >= ${since}::timestamptz)
          or (m.status in ('IN_PLAY', 'PAUSED') and (d.fetched_at is null or d.fetched_at < ${liveCutoff}::timestamptz))
        )
      order by m.utc_date desc
      limit 200`)
  )
  const list: Candidate[] = rows.map((r) => ({
    id: Number(r.id),
    code: String(r.code),
    utcDate: new Date(r.utcDate as string),
    status: String(r.status),
    homeTeamId: Number(r.homeTeamId),
    awayTeamId: Number(r.awayTeamId),
    homeScoreFt: r.homeScoreFt == null ? null : Number(r.homeScoreFt),
    awayScoreFt: r.awayScoreFt == null ? null : Number(r.awayScoreFt),
    hasLineups: Boolean(r.hasLineups),
  }))
  return list
    .filter((c) => c.status === 'FINISHED' || remaining > LIVE_MIN_REMAINING)
    .sort((a, b) => {
      // Live first (they go stale), then top-tier leagues, then most recent.
      const live = Number(b.status !== 'FINISHED') - Number(a.status !== 'FINISHED')
      if (live) return live
      const tier = (TIER.get(a.code) ?? 9) - (TIER.get(b.code) ?? 9)
      if (tier) return tier
      return b.utcDate.getTime() - a.utcDate.getTime()
    })
}

/** Maps upstream list matches onto ours for one league-day. Returns hlId by our id. */
async function mapLeagueDay(
  code: string,
  upstream: HlListMatch[],
  warnings: string[]
): Promise<Map<number, number>> {
  const teams = await competitionTeams(code)
  const teamMap = await loadMappings(PROVIDER, 'team')
  const newTeams: [string, number][] = []

  const ourTeam = (t: { id: number; name: string }): number | null => {
    const known = teamMap.get(String(t.id))
    if (known) return known
    const hit = matchTeam({ teamName: t.name, shortName: '' }, teams)
    if (hit.id === null) {
      warnings.push(`${code}: team "${t.name}" not mapped (${hit.reason})`)
      return null
    }
    teamMap.set(String(t.id), hit.id)
    newTeams.push([String(t.id), hit.id])
    return hit.id
  }

  const kickoffs = upstream.map((m) => new Date(m.date).getTime()).filter(Number.isFinite)
  if (kickoffs.length === 0) return new Map()
  const ours = await ourMatches(
    code,
    new Date(Math.min(...kickoffs) - 6 * 3600_000),
    new Date(Math.max(...kickoffs) + 6 * 3600_000),
    []
  )

  const out = new Map<number, number>()
  const newMatches: [string, number][] = []
  for (const m of upstream) {
    const home = ourTeam(m.homeTeam)
    const away = ourTeam(m.awayTeam)
    if (home === null || away === null) continue
    const hit = matchFixture(new Date(m.date), home, away, ours)
    if (hit.id === null) {
      warnings.push(`${code}: ${m.homeTeam.name} v ${m.awayTeam.name} not mapped (${hit.reason})`)
      continue
    }
    out.set(hit.id, m.id)
    newMatches.push([String(m.id), hit.id])
  }
  if (newTeams.length) await insertMappings(PROVIDER, 'team', newTeams)
  if (newMatches.length) await insertMappings(PROVIDER, 'match', newMatches)
  return out
}

async function writeEvents(matchId: number, rows: ReturnType<typeof planEventRows>): Promise<number> {
  const db = getDb()
  let written = 0
  for (const part of chunk(rows, BATCH)) {
    const res = await db
      .insert(matchEvents)
      .values(
        part.map((r) => ({
          matchId,
          provider: PROVIDER,
          providerEventId: r.providerEventId,
          type: r.type,
          minute: r.minute,
          addedTime: r.addedTime,
          teamId: r.teamId,
          playerName: r.playerName,
          relatedPlayerName: r.relatedPlayerName,
          scoreHome: r.scoreHome,
          scoreAway: r.scoreAway,
          detail: r.detail,
          isCancelled: r.isCancelled,
        }))
      )
      .onConflictDoUpdate({
        target: [matchEvents.provider, matchEvents.providerEventId],
        set: {
          type: sql`excluded.type`,
          minute: sql`excluded.minute`,
          addedTime: sql`excluded.added_time`,
          teamId: sql`excluded.team_id`,
          playerName: sql`excluded.player_name`,
          relatedPlayerName: sql`excluded.related_player_name`,
          scoreHome: sql`excluded.score_home`,
          scoreAway: sql`excluded.score_away`,
          detail: sql`excluded.detail`,
          isCancelled: sql`excluded.is_cancelled`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: matchEvents.id })
    written += res.length
  }
  // Events that disappeared upstream (VAR, corrections) are kept, cancelled.
  const ids = rows.map((r) => r.providerEventId)
  await db
    .update(matchEvents)
    .set({ isCancelled: true, updatedAt: sql`now()` })
    .where(
      and(
        eq(matchEvents.provider, PROVIDER),
        eq(matchEvents.matchId, matchId),
        eq(matchEvents.isCancelled, false),
        ...(ids.length ? [notInArray(matchEvents.providerEventId, ids)] : [])
      )
    )
  return written
}

async function fetchOne(
  client: HighlightlyClient,
  c: Candidate,
  hlId: number,
  teamMap: Map<string, number>
): Promise<number> {
  const detail = await client.matchDetail(hlId)
  // Upstream may list the teams the other way round: orient by our ids.
  const upHome = teamMap.get(String(detail.homeTeam.id))
  const straight = upHome === undefined ? true : upHome === c.homeTeamId
  const hlHomeId = straight ? detail.homeTeam.id : detail.awayTeam.id
  const hlAwayId = straight ? detail.awayTeam.id : detail.homeTeam.id

  const score =
    c.homeScoreFt != null && c.awayScoreFt != null ? { home: c.homeScoreFt, away: c.awayScoreFt } : null
  const events = planEventRows(
    detail.events ?? [],
    { hlMatchId: hlId, hlHomeId, hlAwayId, homeTeamId: c.homeTeamId, awayTeamId: c.awayTeamId },
    score
  )
  let written = await writeEvents(c.id, events)

  const statistics = normaliseStatistics(detail.statistics, hlHomeId, hlAwayId)

  let lineups = null
  if (!c.hasLineups) {
    try {
      lineups = normaliseLineups(await client.lineups(hlId), hlHomeId)
    } catch (err) {
      if (err instanceof BudgetExhaustedError) throw err
      // Lineups are optional; the next pass tries again.
    }
  }

  // Final when upstream says so and either we agree or kick-off is long past
  // (our own status can lag behind; see resourcePriority in ingest).
  const longPast = Date.now() - c.utcDate.getTime() > 4 * 3600_000
  const isFinal = isFinishedState(detail.state?.description) && (c.status === 'FINISHED' || longPast)
  await getDb()
    .insert(matchDetails)
    .values({
      matchId: c.id,
      provider: PROVIDER,
      lineups,
      statistics: statistics.length ? statistics : null,
      venue: detail.venue?.name ?? null,
      referee: refereeName(detail.referee?.name),
      upstreamState: detail.state?.description ?? null,
      fetchedAt: new Date(),
      lineupsFetchedAt: lineups ? new Date() : null,
      isFinal,
    })
    .onConflictDoUpdate({
      target: matchDetails.matchId,
      set: {
        // Keep earlier lineups when this pass did not fetch them.
        lineups: sql`coalesce(excluded.lineups, ${matchDetails.lineups})`,
        lineupsFetchedAt: sql`coalesce(excluded.lineups_fetched_at, ${matchDetails.lineupsFetchedAt})`,
        statistics: sql`coalesce(excluded.statistics, ${matchDetails.statistics})`,
        venue: sql`coalesce(excluded.venue, ${matchDetails.venue})`,
        referee: sql`coalesce(excluded.referee, ${matchDetails.referee})`,
        upstreamState: sql`excluded.upstream_state`,
        fetchedAt: sql`excluded.fetched_at`,
        isFinal: sql`excluded.is_final`,
      },
    })
  written += 1
  return written
}

export async function syncHighlightly(options: { now?: Date; force?: boolean } = {}): Promise<SyncResult> {
  const now = options.now ?? new Date()
  if (!isHighlightlyConfigured()) return { resource: RESOURCE, ok: true, rows: 0 }

  try {
    if (!options.force) {
      const last = await readMarker(PASS_MARKER)
      if (last?.at && now.getTime() - last.at.getTime() < MIN_PASS_INTERVAL_MS) {
        return { resource: RESOURCE, ok: true, rows: 0 }
      }
    }
    await writeMarker(PASS_MARKER, now, 0)

    const client = createHighlightlyClient({ now: () => now })
    let remaining = await client.remaining()
    if (remaining <= 0) return { resource: RESOURCE, ok: true, rows: 0 }

    let candidates: Candidate[]
    try {
      candidates = await loadCandidates(now, remaining)
    } catch (err) {
      // match_details not migrated yet: spend nothing.
      if (isUndefinedTable(err)) return { resource: RESOURCE, ok: true, rows: 0 }
      throw err
    }
    if (candidates.length === 0) {
      await recordState(RESOURCE, { kind: 'success', rows: 0 })
      return { resource: RESOURCE, ok: true, rows: 0 }
    }

    const warnings: string[] = []
    const matchMap = await loadMappings(PROVIDER, 'match') // hlId -> our id
    const hlByOurs = new Map([...matchMap].map(([hl, ours]) => [ours, Number(hl)]))

    // Map unmapped candidates, one list call per league-day.
    const groups = new Map<string, Candidate[]>()
    for (const c of candidates) {
      if (hlByOurs.has(c.id)) continue
      const key = `${c.code}|${c.utcDate.toISOString().slice(0, 10)}`
      groups.set(key, [...(groups.get(key) ?? []), c])
    }
    let rows = 0
    try {
      let listCalls = 0
      for (const key of groups.keys()) {
        if (remaining <= 2 || listCalls >= MAX_LIST_CALLS_PER_PASS) break
        listCalls++
        const [code, date] = key.split('|')
        const league = highlightlyLeague(code)
        if (!league) continue
        const listed = await client.listMatches({ date, leagueId: league.leagueId })
        remaining = await client.remaining()
        for (const [ours, hl] of await mapLeagueDay(code, listed, warnings)) hlByOurs.set(ours, hl)
      }

      const teamMap = await loadMappings(PROVIDER, 'team')
      let done = 0
      for (const c of candidates) {
        if (done >= MAX_MATCHES_PER_PASS || remaining < 2) break
        const hlId = hlByOurs.get(c.id)
        if (!hlId) continue
        try {
          rows += await fetchOne(client, c, hlId, teamMap)
          done++
        } catch (err) {
          if (err instanceof BudgetExhaustedError) throw err
          warnings.push(`match ${c.id}: ${describeError(err)}`)
        }
        remaining = await client.remaining()
      }
    } catch (err) {
      if (!(err instanceof BudgetExhaustedError)) throw err
      warnings.push('daily budget reached')
    }

    for (const w of warnings.slice(0, 20)) console.warn(`[highlightly] ${w}`)
    await recordState(RESOURCE, { kind: 'success', rows })
    return { resource: RESOURCE, ok: true, rows }
  } catch (err) {
    const error = describeError(err)
    await recordState(RESOURCE, { kind: 'failure', error }).catch(() => undefined)
    return { resource: RESOURCE, ok: false, rows: 0, error }
  }
}

