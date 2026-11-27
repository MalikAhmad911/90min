import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { getPlayerPageData, playerIdSchema } from '@/lib/db/player-queries'

export const dynamic = 'force-dynamic'

/** One player's profile, season stats and their club's recent/next matches. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = playerIdSchema.safeParse(params.id)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 })
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Player data is not available' }, { status: 503 })
  }

  try {
    const data = await getPlayerPageData(parsed.data)
    if (!data) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' },
    })
  } catch {
    // The driver's message can contain SQL; never echo it to a client.
    return NextResponse.json({ error: 'Could not load this player' }, { status: 502 })
  }
}
