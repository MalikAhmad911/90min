import { NextRequest, NextResponse } from 'next/server'
import { fetchStandings } from '@/lib/api/football-data'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'
import { isDatabaseConfigured } from '@/lib/db'
import { getStandings } from '@/lib/db/queries'
import { ensureFresh } from '@/lib/server/read-through'

export const dynamic = 'force-dynamic'
// The Neon driver queries over fetch(); without this Next can replay a cached
// query result here instead of reading the database.
export const fetchCache = 'force-no-store'

const SIX_HOURS = 6 * 60 * 60_000

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('competition')

  // Allow-list: only competitions the free plan actually serves.
  if (!code || !FREE_COMPETITION_CODES.includes(code)) {
    return NextResponse.json(
      { error: 'Unknown competition', allowed: FREE_COMPETITION_CODES },
      { status: 400 }
    )
  }

  if (!isDatabaseConfigured()) {
    try {
      const { value } = await fetchStandings(code)
      return NextResponse.json({ ...value, source: 'provider' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message, standings: [] }, { status: 502 })
    }
  }

  try {
    let tables = await getStandings(code)

    // No table stored yet - wait for this one sync rather than show nothing.
    if (tables.length === 0) {
      await ensureFresh({
        resources: [{ resource: `standings:${code}`, maxAgeMs: 0 }],
        blocking: true,
      })
      tables = await getStandings(code)
    } else {
      await ensureFresh({
        resources: [{ resource: `standings:${code}`, maxAgeMs: SIX_HOURS }],
      })
    }

    return NextResponse.json(
      { competition: { code }, standings: tables, source: 'database' },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message, standings: [] }, { status: 502 })
  }
}
