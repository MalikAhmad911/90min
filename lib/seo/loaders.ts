import { cache } from 'react'
import { isDatabaseConfigured } from '@/lib/db'
import { getHeadToHead, getMatchById, getMatchesByTeam, getScorers } from '@/lib/db/queries'
import { getStandingsView } from '@/lib/db/standings-view'
import { getMatchVenue, getTeamById, type TeamRow } from '@/lib/db/seo-queries'
import { withMatchEvents } from '@/lib/db/event-queries'
import type { Match, Scorer, StandingsTable } from '@/lib/types'
import { parseEntityId } from './ids'

/**
 * Data for server-rendered entity pages.
 *
 * Each loader is wrapped in React's `cache`, so `generateMetadata` and the
 * page component share one set of database reads per request.
 *
 * Three outcomes, kept distinct on purpose:
 *   - ok          - render with real content
 *   - not-found   - the id is invalid or absent: a 404
 *   - unavailable - no database configured, or the read failed. The page
 *                   still renders and the client view loads through the API
 *                   as it always has, so an outage degrades to a spinner
 *                   rather than an error page or a false 404.
 *
 * These are pure reads. Freshness (ensureFresh, sync) stays in the API
 * routes and the scheduler, so a page render can never spend provider quota.
 */

export type Loaded<T> = { status: 'ok'; data: T } | { status: 'not-found' } | { status: 'unavailable' }

function unavailable(where: string, err: unknown): { status: 'unavailable' } {
  console.error(`[seo] ${where} read failed, falling back to client rendering:`, err)
  return { status: 'unavailable' }
}

export interface MatchPageData {
  match: Match
  headToHead: Match[]
  venue: string | null
}

export const loadMatchPage = cache(async (rawId: string): Promise<Loaded<MatchPageData>> => {
  const id = parseEntityId(rawId)
  if (id === null) return { status: 'not-found' }
  if (!isDatabaseConfigured()) return { status: 'unavailable' }

  try {
    const match = await getMatchById(id)
    if (!match) return { status: 'not-found' }
    // Same limit as /api/match/[id], so the first poll does not reshuffle the H2H tab.
    const [headToHead, venue, enriched] = await Promise.all([
      getHeadToHead(id, 10),
      getMatchVenue(id),
      // Events, lineups and stats are an enrichment: without them the page
      // still renders, and the client fetch fills them in.
      withMatchEvents(match).catch(() => match),
    ])
    return { status: 'ok', data: { match: enriched, headToHead, venue } }
  } catch (err) {
    return unavailable(`match ${id}`, err)
  }
})

export interface TeamPageData {
  team: TeamRow
  matches: Match[]
}

export const loadTeamPage = cache(async (rawId: string): Promise<Loaded<TeamPageData>> => {
  const id = parseEntityId(rawId)
  if (id === null) return { status: 'not-found' }
  if (!isDatabaseConfigured()) return { status: 'unavailable' }

  try {
    const team = await getTeamById(id)
    if (!team) return { status: 'not-found' }
    // Same limit as /api/team/[id].
    const matches = await getMatchesByTeam(id, 60)
    return { status: 'ok', data: { team, matches } }
  } catch (err) {
    return unavailable(`team ${id}`, err)
  }
})

export interface CompetitionPageData {
  standings: StandingsTable[]
  scorers: Scorer[]
}

/** The competition code must already be allow-listed by `resolveCompetition`. */
export const loadCompetitionPage = cache(
  async (code: string): Promise<Loaded<CompetitionPageData>> => {
    if (!isDatabaseConfigured()) return { status: 'unavailable' }
    try {
      // Same limit as the LeagueView's scorers request; the same (form-filled)
      // standings as /api/standings, so the first fetch does not reshuffle.
      const [standings, scorers] = await Promise.all([getStandingsView(code, 'total'), getScorers(code, 20)])
      return { status: 'ok', data: { standings, scorers } }
    } catch (err) {
      return unavailable(`competition ${code}`, err)
    }
  }
)
