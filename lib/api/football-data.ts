import type { Match } from '@/lib/types'

const BASE = 'https://api.football-data.org/v4'

interface FDMatch {
  id: number
  utcDate: string
  status: string
  minute?: number
  homeTeam: { id: number; name: string; shortName: string; tla: string; crest: string }
  awayTeam: { id: number; name: string; shortName: string; tla: string; crest: string }
  score: {
    fullTime: { home: number | null; away: number | null }
    halfTime: { home: number | null; away: number | null }
  }
  competition: { id: number; name: string; code: string; emblem: string }
}

export async function fetchMatchesByDate(date: string): Promise<Match[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) throw new Error('FOOTBALL_DATA_API_KEY is not set')

  const res = await fetch(`${BASE}/matches?dateFrom=${date}&dateTo=${date}`, {
    headers: { 'X-Auth-Token': key },
    next: { revalidate: 30 },
  })

  if (!res.ok) {
    throw new Error(`football-data.org error: ${res.status} ${res.statusText}`)
  }

  const data: { matches: FDMatch[] } = await res.json()

  return data.matches.map((m) => ({
    id: m.id,
    utcDate: m.utcDate,
    status: m.status as Match['status'],
    minute: m.minute,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    score: m.score,
    competition: m.competition,
  }))
}
