import { NextRequest, NextResponse } from 'next/server'
import { fetchMatchDetail, fetchHeadToHead } from '@/lib/api/football-data'
import { isDatabaseConfigured } from '@/lib/db'
import { getMatchById, getHeadToHead } from '@/lib/db/queries'
import { ensureFresh } from '@/lib/server/read-through'
import { withMatchEvents, type MatchEventsExtras } from '@/lib/db/event-queries'
import type { Match } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MINUTE = 60_000

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid match id' }, { status: 400 })
  }

  if (!isDatabaseConfigured()) {
    try {
      const { value: match } = await fetchMatchDetail(id)
      const headToHead = await fetchHeadToHead(id, 10)
        .then((r) => r.value.matches)
        .catch(() => [])
      return NextResponse.json({ match, headToHead, source: 'provider' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  try {
    const match = await getMatchById(id)
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // A match in play is worth keeping current; a finished one never changes.
    if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
      await ensureFresh({ resources: [{ resource: 'live-window', maxAgeMs: MINUTE }] })
    }

    // Goal events are an enrichment: if they cannot be read, the match is
    // still served, just without the timeline.
    const [enriched, headToHead] = await Promise.all([
      withMatchEvents(match).catch((err): Match & MatchEventsExtras => {
        console.warn('[match] goal events unavailable:', err instanceof Error ? err.message : err)
        return match
      }),
      getHeadToHead(id, 10),
    ])
    const attribution = enriched.attribution ?? null

    return NextResponse.json(
      // `attribution` sits at the top level as well as on the match, so any
      // consumer of this payload sees the ODbL notice without digging.
      { match: enriched, headToHead, source: 'database', ...(attribution ? { attribution } : {}) },
      { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
