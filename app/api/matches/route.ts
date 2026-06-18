import { NextRequest, NextResponse } from 'next/server'
import { fetchMatchesByDate } from '@/lib/api/football-data'
import { formatDate } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? formatDate(new Date())

  try {
    const matches = await fetchMatchesByDate(date)
    return NextResponse.json({ matches, date }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ matches: [], date, error: message }, { status: 500 })
  }
}
