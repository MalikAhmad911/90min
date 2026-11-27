import type { Match, StandingsTable } from '@/lib/types'

/** Shared fixtures for the SEO tests. Not a test file itself. */

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 537785,
    utcDate: '2026-11-28T15:00:00.000Z',
    status: 'TIMED',
    homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://crests.football-data.org/57.png' },
    awayTeam: { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crest: 'https://crests.football-data.org/61.png' },
    score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'https://crests.football-data.org/PL.png' },
    ...overrides,
  }
}

export function makeTable(): StandingsTable[] {
  const row = (position: number, id: number, name: string, shortName: string, points: number) => ({
    position,
    team: { id, name, shortName, tla: shortName.slice(0, 3).toUpperCase(), crest: '' },
    playedGames: 12,
    form: null,
    won: 0,
    draw: 0,
    lost: 0,
    points,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  })
  return [
    {
      stage: 'REGULAR_SEASON',
      type: 'TOTAL',
      group: null,
      table: [row(1, 57, 'Arsenal FC', 'Arsenal', 30), row(2, 64, 'Liverpool FC', 'Liverpool', 27)],
    },
  ]
}
