import { describe, it, expect } from 'vitest'
import { groupByLeague, formatKickoffTime, getStatusLabel } from '@/lib/utils'
import type { Match } from '@/lib/types'

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 1,
  status: 'SCHEDULED',
  utcDate: '2026-06-19T15:00:00Z',
  minute: undefined,
  homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: 'https://crests.football-data.org/64.png' },
  awayTeam: { id: 2, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://crests.football-data.org/57.png' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'https://crests.football-data.org/PL.png' },
  ...overrides,
})

describe('groupByLeague', () => {
  it('groups matches by competition id', () => {
    const matches = [
      makeMatch({ id: 1, competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'pl.png' } }),
      makeMatch({ id: 2, competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'pl.png' } }),
      makeMatch({ id: 3, competition: { id: 2014, name: 'La Liga', code: 'PD', emblem: 'pd.png' } }),
    ]
    const result = groupByLeague(matches)
    expect(result).toHaveLength(2)
    expect(result[0].competitionId).toBe(2021)
    expect(result[0].matches).toHaveLength(2)
    expect(result[1].competitionId).toBe(2014)
    expect(result[1].matches).toHaveLength(1)
  })

  it('returns empty array for empty input', () => {
    expect(groupByLeague([])).toEqual([])
  })
})

describe('getStatusLabel', () => {
  it('returns kickoff time for SCHEDULED', () => {
    const label = getStatusLabel('SCHEDULED', undefined, '2026-06-19T15:00:00Z')
    expect(label).toMatch(/^\d{1,2}:\d{2}/)
  })

  it('returns minute for IN_PLAY', () => {
    expect(getStatusLabel('IN_PLAY', 67, '2026-06-19T15:00:00Z')).toBe("67'")
  })

  it('returns HT for PAUSED', () => {
    expect(getStatusLabel('PAUSED', 45, '2026-06-19T15:00:00Z')).toBe('HT')
  })

  it('returns FT for FINISHED', () => {
    expect(getStatusLabel('FINISHED', undefined, '2026-06-19T15:00:00Z')).toBe('FT')
  })
})
