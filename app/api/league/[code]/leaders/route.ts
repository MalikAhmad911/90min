import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { getLeaders, leaderQueryOrDefault, leagueCodeSchema } from '@/lib/db/league-queries'

export const dynamic = 'force-dynamic'

/** Goals and assists leaderboards: /api/league/PL/leaders?limit=10. */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = leagueCodeSchema.safeParse(params.code)
  if (!code.success) {
    return NextResponse.json({ error: 'Unknown competition', goals: [], assists: [] }, { status: 400 })
  }
  const query = leaderQueryOrDefault(new URL(req.url).searchParams.get('limit'))
  if (!query) {
    return NextResponse.json({ error: 'limit must be 1-50', goals: [], assists: [] }, { status: 400 })
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Leaders are not available', goals: [], assists: [] }, { status: 503 })
  }

  try {
    const data = await getLeaders(code.data, query.limit)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' },
    })
  } catch {
    return NextResponse.json({ error: 'Could not load leaders', goals: [], assists: [] }, { status: 502 })
  }
}
