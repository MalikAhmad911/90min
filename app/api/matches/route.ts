import { NextRequest, NextResponse } from 'next/server'
import { fetchMatchesByDate } from '@/lib/api/football-data'
import { formatDate } from '@/lib/utils'
import { isDatabaseConfigured } from '@/lib/db'
import { getMatchesByDate } from '@/lib/db/queries'
import {
  ensureFresh,
  isColdStart,
  resourcesForDate,
  shouldBlockFor,
} from '@/lib/server/read-through'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'

/** YYYY-MM-DD only - the value reaches both a SQL cast and an upstream query. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('date')
  const date = raw && DATE_RE.test(raw) ? raw : formatDate(new Date())

  if (raw && !DATE_RE.test(raw)) {
    return NextResponse.json({ matches: [], date, error: 'Invalid date' }, { status: 400 })
  }

  // Without a database, fall back to talking to the provider directly. This
  // keeps local development working before anyone has run a migration.
  if (!isDatabaseConfigured()) {
    try {
      const { value: matches, stale, storedAt } = await fetchMatchesByDate(date)
      return NextResponse.json({ matches, date, stale, updatedAt: storedAt, source: 'provider' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ matches: [], date, error: message }, { status: 502 })
    }
  }

  try {
    const resources = resourcesForDate(date, FREE_COMPETITION_CODES)

    // Nothing has ever been ingested: there is no stale data to fall back on,
    // so this one request waits for the sync instead of rendering an empty day.
    const cold = await isColdStart()
    const warming = await ensureFresh({
      resources,
      // Cold: there is nothing to serve, so wait. Live window: one upstream
      // call, awaited so a frozen serverless container cannot drop it.
      blocking: cold || shouldBlockFor(date),
    })

    const matches = await getMatchesByDate(date)

    return NextResponse.json(
      {
        matches,
        date,
        source: 'database',
        // True while a refresh is running behind this response.
        stale: warming.length > 0 && !cold && !shouldBlockFor(date),
        warming: warming.length > 0 ? warming : undefined,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=300' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ matches: [], date, error: message }, { status: 502 })
  }
}
