import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isDatabaseConfigured } from '@/lib/db'
import { getMatchById } from '@/lib/db/queries'
import { HIGHLIGHT_COMPETITIONS } from '@/lib/highlights/channels'
import { getLatestHighlights } from '@/lib/highlights/fetch'
import { findMatchHighlight } from '@/lib/highlights/match'

/**
 * GET /api/highlights?match=123      -> { video | null } for one match
 * GET /api/highlights?competition=PL -> { videos } latest for a competition
 *
 * Feeds come from Next's data cache (30 min), so this route never fans out
 * to YouTube more than once per channel per half hour.
 */

export const dynamic = 'force-dynamic'

const querySchema = z
  .object({
    match: z.coerce.number().int().positive().max(2_000_000_000).optional(),
    competition: z.enum(HIGHLIGHT_COMPETITIONS as [string, ...string[]]).optional(),
  })
  .strict()

const HEADERS = { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=900' }

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const { match: matchId, competition } = parsed.data

  if (matchId === undefined) {
    const videos = await getLatestHighlights({ competition, limit: 24 })
    return NextResponse.json({ videos }, { headers: HEADERS })
  }

  if (!isDatabaseConfigured()) return NextResponse.json({ video: null }, { headers: HEADERS })

  const match = await getMatchById(matchId).catch(() => null)
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  // Only finished (or in-progress, for half-time clips) matches can have one.
  if (match.status !== 'FINISHED' && match.status !== 'IN_PLAY' && match.status !== 'PAUSED') {
    return NextResponse.json({ video: null }, { headers: HEADERS })
  }
  if (!HIGHLIGHT_COMPETITIONS.includes(match.competition.code)) {
    return NextResponse.json({ video: null }, { headers: HEADERS })
  }

  const videos = await getLatestHighlights({ competition: match.competition.code, limit: 60 })
  const video = findMatchHighlight(videos, match)
  return NextResponse.json({ video }, { headers: HEADERS })
}
