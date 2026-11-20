import {
  matchListPolicy,
  matchDetailPolicy,
  FREE_COMPETITIONS,
  FREE_COMPETITION_CODES,
} from '@/lib/api/football-data'
import type { Match, MatchDetail } from '@/lib/types'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 1,
  status: 'SCHEDULED',
  // Far from "now" so the near-kickoff rule does not fire by accident.
  utcDate: new Date(Date.now() + 40 * HOUR).toISOString(),
  homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: '' },
  awayTeam: { id: 2, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: '' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: '' },
  ...overrides,
})

describe('FREE_COMPETITIONS', () => {
  it('lists exactly the 12 competitions on the free plan', () => {
    expect(FREE_COMPETITIONS).toHaveLength(12)
  })

  it('excludes the paid-only competitions the old client kept requesting', () => {
    // EL (Europa League) and CLI (Copa Libertadores) always answered 403.
    expect(FREE_COMPETITION_CODES).not.toContain('EL')
    expect(FREE_COMPETITION_CODES).not.toContain('CLI')
  })

  it('includes the headline free leagues', () => {
    for (const code of ['PL', 'CL', 'PD', 'SA', 'BL1', 'FL1', 'WC']) {
      expect(FREE_COMPETITION_CODES).toContain(code)
    }
  })

  it('has no duplicate codes', () => {
    expect(new Set(FREE_COMPETITION_CODES).size).toBe(FREE_COMPETITION_CODES.length)
  })
})

describe('matchListPolicy', () => {
  it('refreshes every 30s while a match is in play', () => {
    const policy = matchListPolicy([makeMatch({ status: 'IN_PLAY', minute: 55 })])
    expect(policy.freshMs).toBe(30 * SECOND)
  })

  it('treats half-time as live', () => {
    expect(matchListPolicy([makeMatch({ status: 'PAUSED' })]).freshMs).toBe(30 * SECOND)
  })

  it('refreshes every minute when a kickoff is close', () => {
    const soon = new Date(Date.now() + 30 * MINUTE).toISOString()
    const policy = matchListPolicy([makeMatch({ status: 'TIMED', utcDate: soon })])
    expect(policy.freshMs).toBe(MINUTE)
  })

  it('backs right off once every match has finished', () => {
    const policy = matchListPolicy([
      makeMatch({ id: 1, status: 'FINISHED' }),
      makeMatch({ id: 2, status: 'FINISHED' }),
    ])
    expect(policy.freshMs).toBe(6 * HOUR)
  })

  it('counts postponed and cancelled matches as settled', () => {
    const policy = matchListPolicy([
      makeMatch({ id: 1, status: 'FINISHED' }),
      makeMatch({ id: 2, status: 'POSTPONED' }),
      makeMatch({ id: 3, status: 'CANCELLED' }),
    ])
    expect(policy.freshMs).toBe(6 * HOUR)
  })

  it('does not treat a day as settled when one match is still to come', () => {
    const policy = matchListPolicy([
      makeMatch({ id: 1, status: 'FINISHED' }),
      makeMatch({ id: 2, status: 'SCHEDULED' }),
    ])
    expect(policy.freshMs).toBe(15 * MINUTE)
  })

  it('keeps an empty day cheap but retries within the hour', () => {
    const policy = matchListPolicy([])
    expect(policy.freshMs).toBe(15 * MINUTE)
    expect(policy.staleMs).toBe(6 * HOUR)
  })

  it('handles a cold cache', () => {
    expect(matchListPolicy(undefined).freshMs).toBe(15 * MINUTE)
  })
})

describe('matchDetailPolicy', () => {
  const detail = (status: Match['status']): MatchDetail =>
    ({ ...makeMatch({ status }), score: { fullTime: { home: 1, away: 0 }, halfTime: { home: 0, away: 0 } } }) as MatchDetail

  it('polls a live match every 30s', () => {
    expect(matchDetailPolicy(detail('IN_PLAY')).freshMs).toBe(30 * SECOND)
  })

  it('never spends quota re-fetching a finished match', () => {
    // A played match cannot change, so it stays fresh for a full day.
    expect(matchDetailPolicy(detail('FINISHED')).freshMs).toBe(24 * HOUR)
  })

  it('uses a moderate interval for an upcoming match', () => {
    expect(matchDetailPolicy(detail('TIMED')).freshMs).toBe(5 * MINUTE)
  })

  it('handles a cold cache', () => {
    expect(matchDetailPolicy(undefined).freshMs).toBe(2 * MINUTE)
  })
})
