import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { fixturesQuerySchema, getFixturesByRound, leagueCodeSchema } from '@/lib/db/league-queries'

export const dynamic = 'force-dynamic'
// The Neon driver queries over fetch(); without this Next can replay a cached
// query result here instead of reading the database.
export const fetchCache = 'force-no-store'

/** A competition's fixtures for one round: /api/league/PL/fixtures?matchday=12. */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = leagueCodeSchema.safeParse(params.code)
  if (!code.success) {
    return NextResponse.json({ error: 'Unknown competition', fixtures: [] }, { status: 400 })
  }
  const search = new URL(req.url).searchParams
  const query = fixturesQuerySchema.safeParse({ matchday: search.get('matchday') ?? undefined })
  if (!query.success) {
    return NextResponse.json({ error: 'matchday must be 1-60', fixtures: [] }, { status: 400 })
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Fixtures are not available', fixtures: [] }, { status: 503 })
  }

  try {
    const data = await getFixturesByRound(code.data, query.data.matchday)
    // A round with a live match changes by the minute; anything else by the hour.
    const live = data.fixtures.some((f) => f.status === 'IN_PLAY' || f.status === 'PAUSED')
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': live
          ? 'public, s-maxage=30, stale-while-revalidate=60'
          : 'public, s-maxage=600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Could not load fixtures', fixtures: [] }, { status: 502 })
  }
}
