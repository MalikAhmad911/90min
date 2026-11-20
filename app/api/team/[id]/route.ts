import { NextRequest, NextResponse } from 'next/server'
import { fetchTeam } from '@/lib/api/football-data'
import { isDatabaseConfigured } from '@/lib/db'
import { getMatchesByTeam } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 })
  }

  try {
    // Fixtures and results come from our own database - no quota, no waiting.
    const matches = isDatabaseConfigured() ? await getMatchesByTeam(id, 60) : []

    // The squad is not something we store, so it still comes from the
    // provider (cached). If that fails the page simply shows no squad.
    const team = await fetchTeam(id)
      .then((r) => r.value)
      .catch(() => null)

    if (!team && matches.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    // Fall back to the team as it appears in its own fixtures.
    const fromMatches = matches.find((m) => m.homeTeam.id === id)?.homeTeam
      ?? matches.find((m) => m.awayTeam.id === id)?.awayTeam

    return NextResponse.json(
      { team: team ?? fromMatches, matches, source: isDatabaseConfigured() ? 'database' : 'provider' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
