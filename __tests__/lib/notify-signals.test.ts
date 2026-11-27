import { planSignals, SIGNAL_MAX_AGE_MS, type LatestSignal, type StoredState } from '@/lib/notify/signals'
import type { Match } from '@/lib/types'

const NOW = new Date('2026-11-28T20:00:00Z')

function match(
  id: number,
  status: Match['status'],
  home: number | null,
  away: number | null,
  utcDate = '2026-11-28T19:00:00Z'
): Match {
  return {
    id,
    status,
    utcDate,
    homeTeam: { id: 1, name: 'Arsenal', shortName: 'Arsenal', tla: 'ARS', crest: '' },
    awayTeam: { id: 2, name: 'Chelsea', shortName: 'Chelsea', tla: 'CHE', crest: '' },
    score: { fullTime: { home, away }, halfTime: { home: null, away: null } },
    competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: '' },
  }
}

const stored = (...rows: StoredState[]) => new Map(rows.map((r) => [r.id, r]))

describe('planSignals', () => {
  it('emits nothing for a match seen for the first time', () => {
    expect(planSignals([match(1, 'IN_PLAY', 3, 0)], stored(), new Map(), NOW)).toEqual([])
  })

  it('numbers a match\'s signals from 1, in differ order', () => {
    const out = planSignals(
      [match(1, 'FINISHED', 1, 1)],
      stored({ id: 1, status: 'IN_PLAY', home: 1, away: 0 }),
      new Map(),
      NOW
    )
    expect(out.map((p) => [p.type, p.seq, p.baseSeq])).toEqual([
      ['GOAL', 1, 1],
      ['FULL_TIME', 2, 1],
    ])
  })

  it('continues after the latest recorded seq', () => {
    const latest = new Map<number, LatestSignal>([
      [1, { seq: 4, state: { status: 'IN_PLAY', home: 1, away: 0 } }],
    ])
    const out = planSignals(
      [match(1, 'IN_PLAY', 2, 0)],
      stored({ id: 1, status: 'IN_PLAY', home: 1, away: 0 }),
      latest,
      NOW
    )
    expect(out.map((p) => [p.type, p.seq])).toEqual([['GOAL', 5]])
  })

  it('does not re-record a change a racing run already recorded (latest signal = incoming state)', () => {
    // The other run inserted GOAL (state 2-0) but has not upserted the match
    // row yet, so we still read 1-0 from `matches`.
    const latest = new Map<number, LatestSignal>([
      [1, { seq: 5, state: { status: 'IN_PLAY', home: 2, away: 0 } }],
    ])
    const out = planSignals(
      [match(1, 'IN_PLAY', 2, 0)],
      stored({ id: 1, status: 'IN_PLAY', home: 1, away: 0 }),
      latest,
      NOW
    )
    expect(out).toEqual([])
  })

  it('does not flood signals for old matches (first ingest / season catch-up)', () => {
    const old = new Date(NOW.getTime() - SIGNAL_MAX_AGE_MS - 60_000).toISOString()
    const out = planSignals(
      [match(1, 'FINISHED', 2, 1, old), match(2, 'FINISHED', 0, 0, old)],
      stored(
        { id: 1, status: 'TIMED', home: null, away: null },
        { id: 2, status: 'IN_PLAY', home: 0, away: 0 }
      ),
      new Map(),
      NOW
    )
    expect(out).toEqual([])
  })

  it('still announces a postponement of a future match', () => {
    const out = planSignals(
      [match(1, 'POSTPONED', null, null, '2026-12-05T15:00:00Z')],
      stored({ id: 1, status: 'TIMED', home: null, away: null }),
      new Map(),
      NOW
    )
    expect(out.map((p) => p.type)).toEqual(['POSTPONED'])
  })

  it('handles a match listed twice in one payload once (last copy wins)', () => {
    const out = planSignals(
      [match(1, 'IN_PLAY', 1, 0), match(1, 'IN_PLAY', 2, 0)],
      stored({ id: 1, status: 'IN_PLAY', home: 0, away: 0 }),
      new Map(),
      NOW
    )
    expect(out).toHaveLength(1)
    expect(out[0].payload).toMatchObject({ delta: 2, home: 2 })
  })

  it('ignores a match with an unparseable date', () => {
    const out = planSignals(
      [match(1, 'IN_PLAY', 1, 0, 'not a date')],
      stored({ id: 1, status: 'IN_PLAY', home: 0, away: 0 }),
      new Map(),
      NOW
    )
    expect(out).toEqual([])
  })
})
