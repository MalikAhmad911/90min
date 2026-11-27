import { NextRequest, NextResponse } from 'next/server'
import { fetchStandings } from '@/lib/api/football-data'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'
import { isDatabaseConfigured } from '@/lib/db'
import { standingsViewSchema } from '@/lib/db/league-queries'
import { getStandingsView } from '@/lib/db/standings-view'
import { STANDINGS_VIEWS } from '@/lib/standings-splits'
import { ensureFresh } from '@/lib/server/read-through'

export const dynamic = 'force-dynamic'
// The Neon driver queries over fetch(); without this Next can replay a cached
// query result here instead of reading the database.
export const fetchCache = 'force-no-store'

const SIX_HOURS = 6 * 60 * 60_000

/**
 * GET /api/standings?competition=PL[&view=total|home|away]
 *
 * Without `view` the response is exactly what it always was (the stored
 * tables), plus a computed `form` where the provider sent none. `home` and
 * `away` return the same shape with HOME/AWAY tables computed from our own
 * results (PRD LG-1).
 */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const code = params.get('competition')

  // Allow-list: only competitions the free plan actually serves.
  if (!code || !FREE_COMPETITION_CODES.includes(code)) {
    return NextResponse.json(
      { error: 'Unknown competition', allowed: FREE_COMPETITION_CODES },
      { status: 400 }
    )
  }

  const parsedView = standingsViewSchema.safeParse(params.get('view') ?? undefined)
  if (!parsedView.success) {
    return NextResponse.json({ error: 'Unknown view', allowed: STANDINGS_VIEWS }, { status: 400 })
  }
  const view = parsedView.data

  if (!isDatabaseConfigured()) {
    try {
      const { value } = await fetchStandings(code)
      if (view === 'total') return NextResponse.json({ ...value, source: 'provider' })
      // No results stored to compute from: only a split the provider sent itself.
      const type = view.toUpperCase()
      return NextResponse.json({
        ...value,
        standings: (value.standings ?? []).filter((t) => t.type === type),
        view,
        source: 'provider',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message, standings: [] }, { status: 502 })
    }
  }

  try {
    let tables = await getStandingsView(code, view)

    // No table stored yet - wait for this one sync rather than show nothing.
    if (tables.length === 0) {
      await ensureFresh({
        resources: [{ resource: `standings:${code}`, maxAgeMs: 0 }],
        blocking: true,
      })
      tables = await getStandingsView(code, view)
    } else {
      await ensureFresh({
        resources: [{ resource: `standings:${code}`, maxAgeMs: SIX_HOURS }],
      })
    }

    return NextResponse.json(
      {
        competition: { code },
        standings: tables,
        ...(view === 'total' ? {} : { view }),
        source: 'database',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message, standings: [] }, { status: 502 })
  }
}
