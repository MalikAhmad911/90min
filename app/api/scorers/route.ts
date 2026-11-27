import { NextRequest, NextResponse } from 'next/server'
import { fetchScorers } from '@/lib/api/football-data'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'
import { isDatabaseConfigured } from '@/lib/db'
import { getScorers } from '@/lib/db/queries'
import { ensureFresh } from '@/lib/server/read-through'

export const dynamic = 'force-dynamic'
// The Neon driver queries over fetch(); without this Next can replay a cached
// query result here instead of reading the database.
export const fetchCache = 'force-no-store'

const DAY = 24 * 60 * 60_000

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const code = params.get('competition')
  const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 20))

  if (!code || !FREE_COMPETITION_CODES.includes(code)) {
    return NextResponse.json(
      { error: 'Unknown competition', allowed: FREE_COMPETITION_CODES },
      { status: 400 }
    )
  }

  if (!isDatabaseConfigured()) {
    try {
      const { value } = await fetchScorers(code, limit)
      return NextResponse.json({ ...value, source: 'provider' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message, scorers: [] }, { status: 502 })
    }
  }

  try {
    let scorers = await getScorers(code, limit)

    if (scorers.length === 0) {
      await ensureFresh({
        resources: [{ resource: `scorers:${code}`, maxAgeMs: 0 }],
        blocking: true,
      })
      scorers = await getScorers(code, limit)
    } else {
      await ensureFresh({ resources: [{ resource: `scorers:${code}`, maxAgeMs: DAY }] })
    }

    return NextResponse.json(
      { scorers, source: 'database' },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message, scorers: [] }, { status: 502 })
  }
}
