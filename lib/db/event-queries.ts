import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  OPENLIGADB_ATTRIBUTION,
  OPENLIGADB_COMPETITIONS,
  type ProviderAttribution,
} from '@/lib/providers/openligadb'
import type { Match, MatchGoal } from '@/lib/types'

/**
 * Read path for provider match events (goals from OpenLigaDB).
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
export interface MatchEventsExtras {
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

/**
 * Adds provider goals, coverage and attribution to a match. Used by the match
 * API route and meant for the server-rendered match page too, so both serve
 * the same shape. Provider goals replace whatever `goals` held only when there
 * are any; a payload that already carries goals (the no-database fallback)
 * is otherwise left as it was.
 */
export async function withMatchEvents<T extends Match & { goals?: MatchGoal[] }>(
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
