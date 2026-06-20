import type { Match } from '@/lib/types'

const BASE = 'https://api.football-data.org/v4'

// All competitions accessible on the free tier
const COMPETITION_CODES = ['WC', 'EC', 'CL', 'EL', 'PL', 'ELC', 'BL1', 'SA', 'FL1', 'PD', 'DED', 'PPL', 'CLI', 'BSA']

interface FDMatch {
  id: number
  utcDate: string
  status: string
  minute?: number
  group?: string
  stage?: string
  homeTeam: { id: number; name: string; shortName: string; tla: string; crest: string }
  awayTeam: { id: number; name: string; shortName: string; tla: string; crest: string }
  score: {
    fullTime: { home: number | null; away: number | null }
    halfTime: { home: number | null; away: number | null }
  }
  competition: { id: number; name: string; code: string; emblem: string }
}

async function fetchCompetitionMatches(
  code: string,
  date: string,
  key: string
): Promise<Match[]> {
  try {
    const res = await fetch(
      `${BASE}/competitions/${code}/matches?dateFrom=${date}&dateTo=${date}`,
      {
        headers: { 'X-Auth-Token': key },
        next: { revalidate: 30 },
      }
    )
    if (!res.ok) return []
    const data: { matches: FDMatch[] } = await res.json()
    return data.matches.map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status as Match['status'],
      minute: m.minute,
      group: m.group,
      stage: m.stage,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      score: m.score,
      competition: m.competition,
    }))
  } catch {
    return []
  }
}

export async function fetchMatchesByDate(date: string): Promise<Match[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) throw new Error('FOOTBALL_DATA_API_KEY is not set')

  // Fetch all competitions in parallel — stays within 10 req/min limit
  // because this runs server-side and is cached for 30s
  const results = await Promise.all(
    COMPETITION_CODES.map((code) => fetchCompetitionMatches(code, date, key))
  )

  // Flatten and dedupe by match id
  const seen = new Set<number>()
  const matches: Match[] = []
  for (const batch of results) {
    for (const match of batch) {
      if (!seen.has(match.id)) {
        seen.add(match.id)
        matches.push(match)
      }
    }
  }

  // Sort by kickoff time
  return matches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
}
