import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { getSquad, squadQuerySchema } from '@/lib/db/player-queries'

export const dynamic = 'force-dynamic'

/**
 * A club's squad from the players table: /api/player/squad?team=65.
 *
 * Lives under /api/player because this module owns that path; the static
 * `squad` segment takes precedence over the sibling `[id]` route.
 */
export async function GET(req: NextRequest) {
  const parsed = squadQuerySchema.safeParse({
    team: new URL(req.url).searchParams.get('team') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid team id', players: [] }, { status: 400 })
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Squad data is not available', players: [] }, { status: 503 })
  }

  try {
    const players = await getSquad(parsed.data.team)
    return NextResponse.json(
      { teamId: parsed.data.team, players },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    )
  } catch {
    return NextResponse.json({ error: 'Could not load the squad', players: [] }, { status: 502 })
  }
}
