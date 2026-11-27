import { goalsFromEvents, toTimeline, withRedCards, type EventRow } from '@/lib/db/event-queries'
import { isUndefinedTable } from '@/lib/server/sync/sync-state'
import type { Match } from '@/lib/types'

const match = {
  id: 1,
  status: 'FINISHED',
  utcDate: '2026-11-21T15:00:00Z',
  homeTeam: { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crest: '' },
  awayTeam: { id: 341, name: 'Leeds United FC', shortName: 'Leeds United', tla: 'LEE', crest: '' },
  score: { fullTime: { home: 1, away: 4 }, halfTime: { home: 1, away: 1 } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: '' },
} as Match

function row(partial: Partial<EventRow>): EventRow {
  return {
    type: 'GOAL', minute: 10, addedTime: null, teamId: 61, teamName: 'Chelsea FC', playerName: 'X',
    related: null, scoreHome: 1, scoreAway: 0, detail: null, cancelled: false, ...partial,
  }
}

describe('Highlightly read path', () => {
  it('orients the timeline and drops cancelled non-goal corrections', () => {
    const t = toTimeline(
      [
        row({}),
        row({ type: 'YELLOW_CARD', teamId: 341, cancelled: true }),
        row({ type: 'GOAL', teamId: 341, cancelled: true }),
        row({ type: 'SUBSTITUTION', teamId: 341, playerName: 'In', related: 'Out' }),
      ],
      match
    )
    expect(t.map((e) => [e.type, e.side, e.cancelled])).toEqual([
      ['GOAL', 'home', false],
      ['GOAL', 'away', true],
      ['SUBSTITUTION', 'away', false],
    ])
  })

  it('derives goals with assists in the scorers-summary shape', () => {
    const goals = goalsFromEvents([
      row({ related: 'Rogers' }),
      row({ type: 'PENALTY_GOAL', teamId: 341, addedTime: 2, minute: 90 }),
      row({ type: 'YELLOW_CARD' }),
    ])
    expect(goals).toHaveLength(2)
    expect(goals[0].assist?.name).toBe('Rogers')
    expect(goals[1]).toMatchObject({ type: 'PENALTY', injuryTime: 2, minute: 90 })
  })

  it('adds red cards only when there are any', () => {
    expect(withRedCards(match, { redHome: 0, redAway: 0 }).redCards).toBeUndefined()
    expect(withRedCards(match, { redHome: 0, redAway: 2 }).redCards).toEqual({ home: 0, away: 2 })
  })

  it('recognises a missing table through the driver wrapper', () => {
    expect(isUndefinedTable({ cause: { code: '42P01' } })).toBe(true)
    expect(isUndefinedTable(new Error('relation "match_details" does not exist'))).toBe(true)
    expect(isUndefinedTable({ code: '23505' })).toBe(false)
  })
})
