import type { Match } from '@/lib/types'
import type { FreeStream, StreamOverrides } from './types'

/**
 * Stable, public, royalty-free HLS test stream. Used only as a clearly-labeled
 * DEMO feed so the in-app player is verifiably working. Replace with real
 * licensed/official streams in production (see ENABLE_DEMO_FEED below).
 */
const DEMO_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

/**
 * When true, live matches without a curated stream fall back to the DEMO feed
 * above, so the in-app player is demonstrable.
 *
 * OFF for launch. With it on, every live match grew a green "Watch" button
 * that played an unrelated sample clip - which reads as either broken or
 * dishonest. With it off the Watch page behaves like FotMob's: it tells you
 * which broadcaster has the match, and only offers to play something when an
 * admin has added a genuinely free, legal stream for it.
 *
 * Flip to true only in local development.
 */
const ENABLE_DEMO_FEED = false

/**
 * Curated legal/free streams for specific matches, keyed by football-data match id.
 * Populate with official free sources (FIFA+, club/league YouTube live, free-to-air).
 */
const FREE_STREAMS_BY_MATCH: Record<number, FreeStream> = {}

/**
 * Competition-level official free channels (some leagues stream free on YouTube).
 * Keyed by football-data competition code. `src` is a YouTube video/live id.
 */
const FREE_STREAMS_BY_COMPETITION: Record<string, FreeStream> = {}

function isLiveMatch(match: Match): boolean {
  return match.status === 'IN_PLAY' || match.status === 'PAUSED'
}

/**
 * Resolves a free, legal, embeddable stream for a match, or null when none is
 * available (the UI then shows broadcaster info only).
 *
 * Precedence: admin override (per-match, then per-competition) > curated
 * defaults > demo feed for live matches.
 */
export function getFreeStream(match: Match, overrides?: StreamOverrides): FreeStream | null {
  const overrideByMatch = overrides?.byMatch?.[String(match.id)]
  if (overrideByMatch) return overrideByMatch

  const overrideByCompetition = overrides?.byCompetition?.[match.competition.code]
  if (overrideByCompetition) return overrideByCompetition

  const byMatch = FREE_STREAMS_BY_MATCH[match.id]
  if (byMatch) return byMatch

  const byCompetition = FREE_STREAMS_BY_COMPETITION[match.competition.code]
  if (byCompetition) return byCompetition

  if (ENABLE_DEMO_FEED && isLiveMatch(match)) {
    return { kind: 'hls', src: DEMO_HLS, title: 'Demo feed' }
  }

  return null
}
