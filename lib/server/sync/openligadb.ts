import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { matchEvents } from '@/lib/db/schema'
import type { SyncResult } from '@/lib/server/ingest'
import {
  chunk,
  describeError,
  readMarker,
  recordState,
  rowsOf,
  writeMarker,
} from '@/lib/server/sync/sync-state'
import {
  competitionTeams,
  insertMappings,
  loadMappings,
  ourMatches,
  type OurFixture,
} from '@/lib/server/sync/provider-map'
import {
  LEAGUE_TO_COMPETITION,
  OPENLIGADB_LEAGUES,
  changeDateToTimestamp,
  claimLeagueSlot,
  fetchCurrentGroup,
  fetchGroup,
  fetchLastChangeDate,
  fetchSeason,
  goalType,
  matchTeam,
  parseGoalMinute,
  releaseLeagueSlot,
  seasonFor,
  type GoalEventType,
  type OldbGoal,
  type OldbMatch,
  type OpenLigaDbLeague,
} from '@/lib/providers/openligadb'

/**
 * Loads goals from OpenLigaDB into `match_events`.
 *
 * Shape of a pass (each pass first wins the league's request slot, see
 * claimLeagueSlot, so all instances together stay within the etiquette):
 *   - every 6 h: the whole season in one request - backfill, plus repair of
 *     anything edited after the fact;
 *   - while one of our matches in the competition is live or just finished:
 *     ask `getlastchangedate` for the current matchday and refetch that
 *     matchday only when it moved;
 *   - otherwise: nothing, zero requests.
 *
 * Matching to our data never guesses. A team maps only when exactly one team
 * of the competition shares its normalised name (or an alias); a match maps
 * only when both teams and the kickoff (±36 h) agree. Everything else is
 * logged and skipped. Mappings are stored in provider_map so a match is
 * matched once and then followed by id, even if its kickoff moves.
 *
 * Our own scores are never changed. Where a finished match's goal list
 * disagrees with our score, the disagreement is recorded for a human.
 */

const PROVIDER = 'openligadb'
const HOUR = 60 * 60_000
const KICKOFF_TOLERANCE_MS = 36 * HOUR
const FULL_REFRESH_MS = 6 * HOUR
const GROUP_CACHE_MS = HOUR
/** A match counts as active from kickoff until 3.5 h later (covers ET, delays and late VAR edits). */
const ACTIVE_AFTER_KICKOFF_MS = 3.5 * HOUR
const ACTIVE_BEFORE_KICKOFF_MS = 5 * 60_000
const BATCH = 200

const EXTRA_TIME: Record<OpenLigaDbLeague, boolean> = { bl1: false, ucl: true }

export function eventsResource(league: OpenLigaDbLeague): string {
  return `events:${LEAGUE_TO_COMPETITION[league]}`
}

/* ------------------------------------------------------------------ *
 * Pure planning (unit-tested)
 * ------------------------------------------------------------------ */

/** One of our fixtures, as the matcher sees it. */
export type OurMatch = OurFixture

/**
 * Finds our fixture for an upstream match whose teams are already mapped.
 * Both orientations are accepted - the teams and the date identify the game,
 * and goals are placed by team id, not by position - but the straight one
 * wins, and `swapped` is reported so we can see whether team1 is always home.
 */
export function matchFixture(
  kickoff: Date,
  team1Id: number,
  team2Id: number,
  ours: Pick<OurMatch, 'id' | 'homeTeamId' | 'awayTeamId' | 'utcDate'>[],
  toleranceMs = KICKOFF_TOLERANCE_MS
): { id: number; swapped: boolean } | { id: null; reason: 'none' | 'ambiguous' } {
  const near = ours.filter(
    (m) => Math.abs(m.utcDate.getTime() - kickoff.getTime()) <= toleranceMs
  )
  const straight = near.filter((m) => m.homeTeamId === team1Id && m.awayTeamId === team2Id)
  if (straight.length === 1) return { id: straight[0].id, swapped: false }
  if (straight.length > 1) return { id: null, reason: 'ambiguous' }
  const swapped = near.filter((m) => m.homeTeamId === team2Id && m.awayTeamId === team1Id)
  if (swapped.length === 1) return { id: swapped[0].id, swapped: true }
  if (swapped.length > 1) return { id: null, reason: 'ambiguous' }
  return { id: null, reason: 'none' }
}

export interface CreditedGoal {
  goal: OldbGoal
  /** Which upstream side the goal counts for; null when it cannot be told. */
  side: 1 | 2 | null
  warning?: string
}

/**
 * Decides which side each goal counts for from the running score: the side
 * whose tally went up by one. That is right for own goals too - an own goal by
 * a team-2 player raises team 1's score - whereas the scorer's club would be
 * wrong. `scoringTeamId` is only a fallback and a cross-check.
 *
 * Goals are ordered by total score (it rises by exactly one per goal), which
 * is more reliable than minutes: 45+1 is written as 46, same as the 46th.
 */
export function creditGoals(goals: OldbGoal[], team1Id: number, team2Id: number): CreditedGoal[] {
  const ordered = [...goals].sort(
    (a, b) => a.scoreTeam1 + a.scoreTeam2 - (b.scoreTeam1 + b.scoreTeam2) || a.goalID - b.goalID
  )
  let prev1 = 0
  let prev2 = 0
  return ordered.map((goal) => {
    const d1 = goal.scoreTeam1 - prev1
    const d2 = goal.scoreTeam2 - prev2
    prev1 = goal.scoreTeam1
    prev2 = goal.scoreTeam2

    const fromScore: 1 | 2 | null = d1 === 1 && d2 === 0 ? 1 : d1 === 0 && d2 === 1 ? 2 : null
    const fromId: 1 | 2 | null =
      goal.scoringTeamId === team1Id ? 1 : goal.scoringTeamId === team2Id ? 2 : null

    if (fromScore !== null) {
      const warning =
        fromId !== null && fromId !== fromScore
          ? `goal ${goal.goalID}: scoringTeamId disagrees with the running score; trusting the score`
          : undefined
      return { goal, side: fromScore, warning }
    }
    return {
      goal,
      side: fromId,
      warning: `goal ${goal.goalID}: running score jumped ${d1}/${d2}; ${
        fromId ? 'used scoringTeamId' : 'side unknown'
      }`,
    }
  })
}

export interface GoalRow {
  matchId: number
  providerEventId: string
  type: GoalEventType
  minute: number | null
  addedTime: number | null
  teamId: number | null
  playerName: string | null
  scoreHome: number
  scoreAway: number
}

/** Turns one upstream match into rows for `match_events`, in OUR home/away order. */
export function planGoalRows(
  upstream: Pick<OldbMatch, 'goals' | 'team1' | 'team2'>,
  ours: Pick<OurMatch, 'id' | 'homeTeamId' | 'awayTeamId'>,
  team1OurId: number,
  extraTime: boolean
): { rows: GoalRow[]; warnings: string[] } {
  const team1IsHome = team1OurId === ours.homeTeamId
  const warnings: string[] = []
  const credited = creditGoals(upstream.goals ?? [], upstream.team1.teamId, upstream.team2.teamId)

  const rows = credited.map(({ goal, side, warning }) => {
    if (warning) warnings.push(warning)
    const { minute, addedTime } = parseGoalMinute(goal, extraTime)
    const teamId =
      side === null ? null : (side === 1) === team1IsHome ? ours.homeTeamId : ours.awayTeamId
    return {
      matchId: ours.id,
      providerEventId: String(goal.goalID),
      type: goalType(goal),
      minute,
      addedTime,
      teamId,
      playerName: goal.goalGetterName?.trim() || null,
      scoreHome: team1IsHome ? goal.scoreTeam1 : goal.scoreTeam2,
      scoreAway: team1IsHome ? goal.scoreTeam2 : goal.scoreTeam1,
    }
  })
  return { rows, warnings }
}

export interface ScoreMismatch {
  matchId: number
  ours: { home: number; away: number }
  goals: { home: number; away: number; unattributed: number }
}

/**
 * Compares a finished match's goal tally with the score we store. Returns
 * null when they agree or when the comparison means nothing (not finished on
 * both sides, or we hold no score).
 */
export function findScoreMismatch(
  ours: OurMatch,
  upstreamFinished: boolean,
  rows: Pick<GoalRow, 'teamId'>[]
): ScoreMismatch | null {
  if (!upstreamFinished || ours.status !== 'FINISHED') return null
  if (ours.homeScoreFt == null || ours.awayScoreFt == null) return null
  const home = rows.filter((r) => r.teamId === ours.homeTeamId).length
  const away = rows.filter((r) => r.teamId === ours.awayTeamId).length
  const unattributed = rows.length - home - away
  if (home === ours.homeScoreFt && away === ours.awayScoreFt && unattributed === 0) return null
  return {
    matchId: ours.id,
    ours: { home: ours.homeScoreFt, away: ours.awayScoreFt },
    goals: { home, away, unattributed },
  }
}

/* ------------------------------------------------------------------ *
 * Database helpers
 * ------------------------------------------------------------------ */

async function isActive(code: string, now: Date): Promise<boolean> {
  const from = new Date(now.getTime() - ACTIVE_AFTER_KICKOFF_MS).toISOString()
  const to = new Date(now.getTime() + ACTIVE_BEFORE_KICKOFF_MS).toISOString()
  const rows = rowsOf(
    await getDb().execute(sql`
      select 1 from matches
      where competition_code = ${code}
        and (status in ('IN_PLAY', 'PAUSED')
             or utc_date between ${from}::timestamptz and ${to}::timestamptz)
      limit 1`)
  )
  return rows.length > 0
}

/* ------------------------------------------------------------------ *
 * Ingestion of one payload
 * ------------------------------------------------------------------ */

export interface IngestStats {
  upstreamMatches: number
  invalidMatches: number
  teamsUnmapped: string[]
  matchesMapped: number
  matchesUnmapped: { matchID: number; teams: string; kickoff: string; reason: string }[]
  swappedOrientation: number
  goalsSeen: number
  goalsWritten: number
  goalsCancelled: number
  mismatches: ScoreMismatch[]
  warnings: string[]
}

async function ingest(
  league: OpenLigaDbLeague,
  payload: { matches: OldbMatch[]; invalid: number }
): Promise<IngestStats> {
  const code = LEAGUE_TO_COMPETITION[league]
  const stats: IngestStats = {
    upstreamMatches: payload.matches.length,
    invalidMatches: payload.invalid,
    teamsUnmapped: [],
    matchesMapped: 0,
    matchesUnmapped: [],
    swappedOrientation: 0,
    goalsSeen: 0,
    goalsWritten: 0,
    goalsCancelled: 0,
    mismatches: [],
    warnings: [],
  }
  if (payload.matches.length === 0) return stats

  // 1. Teams.
  let teamMap = await loadMappings(PROVIDER, 'team')
  const upstreamTeams = new Map(
    payload.matches.flatMap((m) => [m.team1, m.team2]).map((t) => [String(t.teamId), t])
  )
  const unmappedTeams = [...upstreamTeams.values()].filter((t) => !teamMap.has(String(t.teamId)))
  if (unmappedTeams.length) {
    const candidates = await competitionTeams(code)
    const taken = new Set(teamMap.values())
    const fresh: [string, number][] = []
    for (const t of unmappedTeams) {
      const hit = matchTeam(t, candidates)
      if (hit.id !== null && !taken.has(hit.id)) {
        fresh.push([String(t.teamId), hit.id])
        taken.add(hit.id)
      } else {
        const why = hit.id === null ? hit.reason : 'our team already mapped to another OpenLigaDB id'
        stats.teamsUnmapped.push(`${t.teamName} (${t.teamId}): ${why}`)
      }
    }
    if (fresh.length) {
      await insertMappings(PROVIDER, 'team', fresh)
      teamMap = await loadMappings(PROVIDER, 'team')
    }
  }

  // 2. Matches.
  let matchMap = await loadMappings(PROVIDER, 'match')
  const kickoffs = payload.matches
    .map((m) => new Date(m.matchDateTimeUTC).getTime())
    .filter(Number.isFinite)
  if (kickoffs.length === 0) return stats
  const from = new Date(Math.min(...kickoffs) - 2 * KICKOFF_TOLERANCE_MS)
  const to = new Date(Math.max(...kickoffs) + 2 * KICKOFF_TOLERANCE_MS)
  const knownIds = payload.matches
    .map((m) => matchMap.get(String(m.matchID)))
    .filter((id): id is number => id !== undefined)
  const ours = await ourMatches(code, from, to, knownIds)
  const oursById = new Map(ours.map((m) => [m.id, m]))

  const freshMatches: [string, number][] = []
  const takenMatches = new Set(matchMap.values())
  for (const m of payload.matches) {
    if (matchMap.has(String(m.matchID))) continue
    const t1 = teamMap.get(String(m.team1.teamId))
    const t2 = teamMap.get(String(m.team2.teamId))
    const label = `${m.team1.teamName} v ${m.team2.teamName}`
    if (t1 === undefined || t2 === undefined) {
      stats.matchesUnmapped.push({
        matchID: m.matchID,
        teams: label,
        kickoff: m.matchDateTimeUTC,
        reason: 'team unmapped',
      })
      continue
    }
    const hit = matchFixture(new Date(m.matchDateTimeUTC), t1, t2, ours)
    if (hit.id === null || takenMatches.has(hit.id)) {
      stats.matchesUnmapped.push({
        matchID: m.matchID,
        teams: label,
        kickoff: m.matchDateTimeUTC,
        reason: hit.id === null ? hit.reason : 'our match already mapped',
      })
      continue
    }
    freshMatches.push([String(m.matchID), hit.id])
    takenMatches.add(hit.id)
  }
  if (freshMatches.length) {
    await insertMappings(PROVIDER, 'match', freshMatches)
    matchMap = await loadMappings(PROVIDER, 'match')
  }

  // 3. Goals.
  const rows: GoalRow[] = []
  const syncedMatchIds: number[] = []
  for (const m of payload.matches) {
    const ourId = matchMap.get(String(m.matchID))
    const our = ourId !== undefined ? oursById.get(ourId) : undefined
    const t1 = teamMap.get(String(m.team1.teamId))
    const t2 = teamMap.get(String(m.team2.teamId))
    if (!our || t1 === undefined || t2 === undefined) continue

    // A stored mapping must still describe the same pairing; if not, stop
    // rather than write goals onto the wrong game.
    const pair = new Set([t1, t2])
    if (!pair.has(our.homeTeamId) || !pair.has(our.awayTeamId)) {
      stats.warnings.push(`match ${m.matchID} -> ${our.id}: teams no longer agree; skipped`)
      continue
    }

    stats.matchesMapped++
    if (t1 !== our.homeTeamId) stats.swappedOrientation++
    syncedMatchIds.push(our.id)

    const planned = planGoalRows(m, our, t1, EXTRA_TIME[league])
    stats.goalsSeen += planned.rows.length
    stats.warnings.push(...planned.warnings.map((w) => `match ${our.id}: ${w}`))
    rows.push(...planned.rows)

    const mismatch = findScoreMismatch(our, m.matchIsFinished, planned.rows)
    if (mismatch) stats.mismatches.push(mismatch)
  }

  const db = getDb()
  for (const part of chunk(rows, BATCH)) {
    const written = await db
      .insert(matchEvents)
      .values(part.map((r) => ({ ...r, provider: PROVIDER, isCancelled: false })))
      .onConflictDoUpdate({
        target: [matchEvents.provider, matchEvents.providerEventId],
        set: {
          matchId: sql`excluded.match_id`,
          type: sql`excluded.type`,
          minute: sql`excluded.minute`,
          addedTime: sql`excluded.added_time`,
          teamId: sql`excluded.team_id`,
          playerName: sql`excluded.player_name`,
          scoreHome: sql`excluded.score_home`,
          scoreAway: sql`excluded.score_away`,
          isCancelled: sql`false`,
          updatedAt: sql`now()`,
        },
        // Unchanged rows are left alone, so a repeat sync writes nothing and
        // updated_at keeps meaning "last time upstream changed this goal".
        setWhere: sql`(${matchEvents.matchId}, ${matchEvents.type}, ${matchEvents.minute},
                       ${matchEvents.addedTime}, ${matchEvents.teamId}, ${matchEvents.playerName},
                       ${matchEvents.scoreHome}, ${matchEvents.scoreAway}, ${matchEvents.isCancelled})
                      is distinct from
                      (excluded.match_id, excluded.type, excluded.minute, excluded.added_time,
                       excluded.team_id, excluded.player_name, excluded.score_home,
                       excluded.score_away, false)`,
      })
      .returning({ id: matchEvents.id })
    stats.goalsWritten += written.length
  }

  // A goal that vanished upstream (VAR, or an editor's correction) stays
  // visible, struck through. Only matches present in this payload are
  // touched, so a one-matchday refetch cannot cancel another matchday.
  const currentIds = rows.map((r) => r.providerEventId)
  for (const part of chunk(syncedMatchIds, BATCH)) {
    const cancelled = await db
      .update(matchEvents)
      .set({ isCancelled: true, updatedAt: sql`now()` })
      .where(
        and(
          eq(matchEvents.provider, PROVIDER),
          eq(matchEvents.isCancelled, false),
          inArray(matchEvents.matchId, part),
          ...(currentIds.length ? [notInArray(matchEvents.providerEventId, currentIds)] : [])
        )
      )
      .returning({ id: matchEvents.id })
    stats.goalsCancelled += cancelled.length
  }

  for (const t of stats.teamsUnmapped) console.warn(`[openligadb:${league}] team not mapped: ${t}`)
  for (const m of stats.matchesUnmapped) {
    console.warn(
      `[openligadb:${league}] match not mapped: ${m.matchID} ${m.teams} ${m.kickoff} (${m.reason})`
    )
  }
  for (const w of stats.warnings) console.warn(`[openligadb:${league}] ${w}`)

  return stats
}

/** Persists the latest score disagreements where an admin can see them. */
async function recordMismatches(league: OpenLigaDbLeague, list: ScoreMismatch[]): Promise<void> {
  for (const m of list) {
    console.warn(
      `[openligadb:${league}] match ${m.matchId}: our score ${m.ours.home}-${m.ours.away}, goals ${m.goals.home}-${m.goals.away}` +
        (m.goals.unattributed ? ` (+${m.goals.unattributed} unattributed)` : '')
    )
  }
  const note = list.length
    ? list
        .map(
          (m) => `${m.matchId}: ours ${m.ours.home}-${m.ours.away}, goals ${m.goals.home}-${m.goals.away}`
        )
        .join('; ')
        .slice(0, 500)
    : null
  await writeMarker(`openligadb:${league}:mismatches`, new Date(), list.length, note)
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export interface OpenLigaDbSyncResult extends SyncResult {
  /** Why nothing was fetched, when nothing was. */
  skipped?: 'throttled' | 'idle' | 'unchanged'
  mode?: 'season' | 'matchday'
  stats?: IngestStats
}

/**
 * One sync pass for a league. Safe to call as often as you like: the request
 * slot, the change-date check and the idle check decide whether upstream is
 * contacted at all. `rows` is the number of goal rows inserted, changed or
 * cancelled.
 */
export async function syncOpenLigaDbEvents(
  league: OpenLigaDbLeague,
  options: { now?: Date } = {}
): Promise<OpenLigaDbSyncResult> {
  if (!(OPENLIGADB_LEAGUES as readonly string[]).includes(league)) {
    return { resource: `events:${String(league)}`, ok: false, rows: 0, error: 'Unknown league' }
  }
  const resource = eventsResource(league)
  const now = options.now ?? new Date()

  try {
    await recordState(resource, { kind: 'attempt' })
    const slot = await claimLeagueSlot(league, now)
    if (!slot.claimed) return { resource, ok: true, rows: 0, skipped: 'throttled' }

    try {
      const code = LEAGUE_TO_COMPETITION[league]
      const season = seasonFor(now)
      const seasonMarker = `openligadb:${league}:${season}:season`
      const lastFull = await readMarker(seasonMarker)
      let result: OpenLigaDbSyncResult

      if (!lastFull?.at || now.getTime() - lastFull.at.getTime() > FULL_REFRESH_MS) {
        const stats = await ingest(league, await fetchSeason(league, season))
        await recordMismatches(league, stats.mismatches)
        await writeMarker(seasonMarker, now, stats.goalsSeen)
        result = {
          resource,
          ok: true,
          rows: stats.goalsWritten + stats.goalsCancelled,
          mode: 'season',
          stats,
        }
      } else if (await isActive(code, now)) {
        const groupMarker = `openligadb:${league}:group`
        const cached = await readMarker(groupMarker)
        let group = cached?.value ?? 0
        if (!cached?.at || group < 1 || now.getTime() - cached.at.getTime() > GROUP_CACHE_MS) {
          group = await fetchCurrentGroup(league)
          await writeMarker(groupMarker, now, group)
        }

        // Cheap question first; the matchday itself only when it moved.
        const changeMarker = `openligadb:${league}:${season}:md${group}`
        const change = await fetchLastChangeDate(league, season, group)
        const changedAt = changeDateToTimestamp(change)
        const seen = await readMarker(changeMarker)
        if (changedAt && seen?.at && seen.at.getTime() === changedAt.getTime()) {
          result = { resource, ok: true, rows: 0, skipped: 'unchanged', mode: 'matchday' }
        } else {
          const stats = await ingest(league, await fetchGroup(league, season, group))
          if (stats.mismatches.length) await recordMismatches(league, stats.mismatches)
          if (changedAt) await writeMarker(changeMarker, changedAt, group)
          result = {
            resource,
            ok: true,
            rows: stats.goalsWritten + stats.goalsCancelled,
            mode: 'matchday',
            stats,
          }
        }
      } else {
        result = { resource, ok: true, rows: 0, skipped: 'idle' }
      }

      await releaseLeagueSlot(league, { ok: true })
      await recordState(resource, { kind: 'success', rows: result.rows })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await releaseLeagueSlot(league, { ok: false, error: message }).catch(() => undefined)
      throw err
    }
  } catch (err) {
    const message = describeError(err)
    await recordState(resource, { kind: 'failure', error: message }).catch(() => undefined)
    return { resource, ok: false, rows: 0, error: message }
  }
}
