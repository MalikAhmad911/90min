import { diffMatch, type MatchState } from '@/lib/notify/differ'

const s = (status: string, home: number | null = null, away: number | null = null): MatchState => ({
  status,
  home,
  away,
})
const types = (prev: MatchState, next: MatchState) => diffMatch(prev, next).map((x) => x.type)

describe('diffMatch: status transitions', () => {
  it('emits nothing when nothing changed', () => {
    expect(diffMatch(s('IN_PLAY', 1, 0), s('IN_PLAY', 1, 0))).toEqual([])
    expect(diffMatch(s('TIMED'), s('TIMED'))).toEqual([])
  })

  it('SCHEDULED or TIMED -> IN_PLAY is a kick-off', () => {
    expect(types(s('SCHEDULED'), s('IN_PLAY', 0, 0))).toEqual(['KICKOFF'])
    expect(types(s('TIMED'), s('IN_PLAY', 0, 0))).toEqual(['KICKOFF'])
  })

  it('a rescheduled (POSTPONED) match going live is also a kick-off', () => {
    expect(types(s('POSTPONED'), s('IN_PLAY', 0, 0))).toEqual(['KICKOFF'])
  })

  it('-> PAUSED is half-time, PAUSED -> IN_PLAY is the second half', () => {
    expect(types(s('IN_PLAY', 1, 1), s('PAUSED', 1, 1))).toEqual(['HALF_TIME'])
    expect(types(s('PAUSED', 1, 1), s('IN_PLAY', 1, 1))).toEqual(['SECOND_HALF'])
  })

  it('-> FINISHED is full-time, from IN_PLAY or PAUSED', () => {
    expect(types(s('IN_PLAY', 2, 1), s('FINISHED', 2, 1))).toEqual(['FULL_TIME'])
    expect(types(s('PAUSED', 0, 0), s('FINISHED', 0, 0))).toEqual(['FULL_TIME'])
  })

  it('postponement and cancellation', () => {
    expect(types(s('TIMED'), s('POSTPONED'))).toEqual(['POSTPONED'])
    expect(types(s('SCHEDULED'), s('CANCELLED'))).toEqual(['CANCELLED'])
    // Abandoned mid-match: no score signal for a null score.
    expect(types(s('IN_PLAY', 1, 0), s('POSTPONED', null, null))).toEqual(['POSTPONED'])
  })

  it('SCHEDULED -> TIMED (a kick-off time being confirmed) is not news', () => {
    expect(types(s('SCHEDULED'), s('TIMED'))).toEqual([])
  })

  it('a provider moving a match backwards emits nothing', () => {
    expect(types(s('IN_PLAY', 0, 0), s('TIMED', null, null))).toEqual([])
  })
})

describe('diffMatch: goals', () => {
  it('a side scoring once is one GOAL with delta 1 and the new score', () => {
    const [sig, ...rest] = diffMatch(s('IN_PLAY', 1, 0), s('IN_PLAY', 2, 0))
    expect(rest).toEqual([])
    expect(sig.type).toBe('GOAL')
    expect(sig.payload).toMatchObject({ side: 'home', delta: 1, home: 2, away: 0, prevHome: 1, prevAway: 0 })
  })

  it('an away goal names the away side', () => {
    expect(diffMatch(s('IN_PLAY', 0, 0), s('IN_PLAY', 0, 1))[0].payload.side).toBe('away')
  })

  it('a +2 jump between syncs is ONE GOAL signal carrying delta 2 (documented decision)', () => {
    const out = diffMatch(s('IN_PLAY', 0, 0), s('IN_PLAY', 2, 0))
    expect(out.map((x) => x.type)).toEqual(['GOAL'])
    expect(out[0].payload.delta).toBe(2)
  })

  it('both sides scoring between syncs is one GOAL per side, home first', () => {
    const out = diffMatch(s('IN_PLAY', 1, 1), s('IN_PLAY', 2, 2))
    expect(out.map((x) => [x.type, x.payload.side])).toEqual([
      ['GOAL', 'home'],
      ['GOAL', 'away'],
    ])
  })

  it('a goal before our first live poll comes after the kick-off signal', () => {
    expect(types(s('TIMED', null, null), s('IN_PLAY', 1, 0))).toEqual(['KICKOFF', 'GOAL'])
  })

  it('a goal on the same poll as the whistle lands before HALF_TIME / FULL_TIME', () => {
    expect(types(s('IN_PLAY', 0, 0), s('PAUSED', 1, 0))).toEqual(['GOAL', 'HALF_TIME'])
    expect(types(s('IN_PLAY', 1, 0), s('FINISHED', 1, 1))).toEqual(['GOAL', 'FULL_TIME'])
  })

  it('a goal right after the restart lands after SECOND_HALF', () => {
    expect(types(s('PAUSED', 0, 0), s('IN_PLAY', 0, 1))).toEqual(['SECOND_HALF', 'GOAL'])
  })

  it('catch-up: not-started straight to FINISHED is FULL_TIME only, no stale goals', () => {
    expect(types(s('TIMED'), s('FINISHED', 3, 2))).toEqual(['FULL_TIME'])
  })

  it('a null old score of a started match counts as zero', () => {
    const out = diffMatch(s('IN_PLAY', null, null), s('IN_PLAY', 1, 0))
    expect(out.map((x) => x.type)).toEqual(['GOAL'])
    expect(out[0].payload).toMatchObject({ side: 'home', delta: 1 })
  })
})

describe('diffMatch: corrections (NT-3)', () => {
  it('a score going down is a SCORE_CORRECTION with a negative delta', () => {
    const out = diffMatch(s('IN_PLAY', 2, 1), s('IN_PLAY', 1, 1))
    expect(out.map((x) => x.type)).toEqual(['SCORE_CORRECTION'])
    expect(out[0].payload).toMatchObject({ side: 'home', delta: -1, home: 1, prevHome: 2 })
  })

  it('a correction after full-time is still reported', () => {
    expect(types(s('FINISHED', 2, 2), s('FINISHED', 2, 1))).toEqual(['SCORE_CORRECTION'])
  })

  it('one side corrected while the other scores yields both, home first', () => {
    expect(
      diffMatch(s('IN_PLAY', 1, 0), s('IN_PLAY', 0, 1)).map((x) => [x.type, x.payload.side])
    ).toEqual([
      ['SCORE_CORRECTION', 'home'],
      ['GOAL', 'away'],
    ])
  })

  it('a score disappearing (null) is "unknown", never a correction', () => {
    expect(types(s('IN_PLAY', 2, 1), s('IN_PLAY', null, null))).toEqual([])
  })
})
