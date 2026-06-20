import type { Match } from '@/lib/types'
import type { FreeStream } from './types'

/**
 * Stable, public, royalty-free HLS test stream. Used only as a clearly-labeled
 * DEMO feed so the in-app player is verifiably working. Replace with real
 * licensed/official streams in production (see ENABLE_DEMO_FEED below).
 */
const DEMO_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

/**
 * When true, live matches without a curated stream fall back to the DEMO feed
 * so the "Watch" button is always demonstrable. Set to false in production.
 */
const ENABLE_DEMO_FEED = true

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
 */
export function getFreeStream(match: Match): FreeStream | null {
  const byMatch = FREE_STREAMS_BY_MATCH[match.id]
  if (byMatch) return byMatch

  const byCompetition = FREE_STREAMS_BY_COMPETITION[match.competition.code]
  if (byCompetition) return byCompetition

  if (ENABLE_DEMO_FEED && isLiveMatch(match)) {
    return { kind: 'hls', src: DEMO_HLS, title: 'Demo feed' }
  }

  return null
}
