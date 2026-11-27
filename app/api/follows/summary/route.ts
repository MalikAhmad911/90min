import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { getFollowSummary } from '@/lib/db/follow-queries'
import { deviceIdFrom } from '../schema'

/**
 * Followed teams, competitions, players and matches with display names and
 * each one's next match - what the Following page and the sidebar render.
 * Scoped to the device in the `x-device-id` header, like /api/follows.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(req: NextRequest) {
  const deviceId = deviceIdFrom(req.headers)
  if (!deviceId) {
    return NextResponse.json({ error: 'Missing or invalid device id' }, { status: 400, headers: NO_STORE })
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Follows are unavailable' }, { status: 503, headers: NO_STORE })
  }
  try {
    const summary = await getFollowSummary(deviceId)
    return NextResponse.json(summary, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Could not load follows' }, { status: 502, headers: NO_STORE })
  }
}
