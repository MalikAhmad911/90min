import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { searchAll } from '@/lib/db/search-queries'
import { parseSearchQuery } from '@/components/search/schema'

/**
 * GET /api/search?q=  - type-ahead for the TopNav combobox (PRD SR-1).
 *
 * Public and read-only. The response depends on nothing but `q`, so the CDN
 * may share it between users for a minute; that is what keeps a burst of
 * identical keystrokes ("liv", "live", "liver"...) off the database.
 */

export const dynamic = 'force-dynamic'
/**
 * The Neon HTTP driver talks to Postgres with `fetch` (a POST), and Next 14
 * patches `fetch` with its Data Cache. Observed in this repo: without this
 * line every distinct search statement was stored in .next/cache/fetch-cache
 * and replayed forever - stale results, and a "3 ms" database time that was
 * really a disk read. The CDN header below is the only cache we want.
 */
export const fetchCache = 'force-no-store'

/** Results per group in the dropdown. The /search page asks for more. */
const TYPEAHEAD_LIMIT = 5

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const started = performance.now()

  // Only `q` is read; any other parameter is ignored rather than trusted.
  const parsed = parseSearchQuery(req.nextUrl.searchParams.get('q'))
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Search is unavailable' }, { status: 503, headers: NO_STORE })
  }

  try {
    const dbStarted = performance.now()
    const results = await searchAll(parsed.q, { limit: TYPEAHEAD_LIMIT })
    const dbMs = performance.now() - dbStarted
    const totalMs = performance.now() - started

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, s-maxage=60',
        // Visible in the browser's network panel: tells "slow database" apart
        // from "slow network" when checking the 150 ms budget.
        'Server-Timing': `db;desc="Database";dur=${dbMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
      },
    })
  } catch (err) {
    // Log the detail server-side; the client only needs to know it failed.
    console.error('[search] query failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Search failed' }, { status: 502, headers: NO_STORE })
  }
}
