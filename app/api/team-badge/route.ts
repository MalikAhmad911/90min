import { NextRequest, NextResponse } from 'next/server'
import { getTeamBadge } from '@/lib/api/thesportsdb'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get('name')
  if (!name) return NextResponse.json({ badge: null })

  const badge = await getTeamBadge(name)
  return NextResponse.json({ badge }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
