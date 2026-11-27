import {
  changeDateToTimestamp,
  goalType,
  matchTeam,
  nameCore,
  normaliseName,
  parseGoalMinute,
  parseMatches,
  seasonFor,
  slotDecision,
  teamKey,
  userAgent,
  MAX_BACKOFF_MS,
  MIN_INTERVAL_MS,
  type CandidateTeam,
  type OldbGoal,
} from '@/lib/providers/openligadb'
import {
  creditGoals,
  findScoreMismatch,
  matchFixture,
  planGoalRows,
  type OurMatch,
} from '@/lib/server/sync/openligadb'

/** Our Bundesliga teams as stored in the database (football-data names). */
const BL1: CandidateTeam[] = [
  { id: 1, name: '1. FC Köln', shortName: '1. FC Köln' },
  { id: 28, name: '1. FC Union Berlin', shortName: 'Union Berlin' },
  { id: 15, name: '1. FSV Mainz 05', shortName: 'Mainz' },
  { id: 3, name: 'Bayer 04 Leverkusen', shortName: 'Leverkusen' },
  { id: 4, name: 'Borussia Dortmund', shortName: 'Dortmund' },
  { id: 18, name: 'Borussia Mönchengladbach', shortName: "M'gladbach" },
  { id: 19, name: 'Eintracht Frankfurt', shortName: 'Frankfurt' },
  { id: 16, name: 'FC Augsburg', shortName: 'Augsburg' },
  { id: 5, name: 'FC Bayern München', shortName: 'Bayern' },
  { id: 6, name: 'FC Schalke 04', shortName: 'Schalke' },
  { id: 7, name: 'Hamburger SV', shortName: 'HSV' },
  { id: 721, name: 'RB Leipzig', shortName: 'RB Leipzig' },
  { id: 17, name: 'SC Freiburg', shortName: 'Freiburg' },
  { id: 29, name: 'SC Paderborn 07', shortName: 'SC Paderborn' },
  { id: 719, name: 'SV 07 Elversberg', shortName: 'Elversberg' },
  { id: 12, name: 'SV Werder Bremen', shortName: 'Bremen' },
  { id: 2, name: 'TSG 1899 Hoffenheim', shortName: 'Hoffenheim' },
  { id: 10, name: 'VfB Stuttgart', shortName: 'Stuttgart' },
]

function goal(partial: Partial<OldbGoal> & Pick<OldbGoal, 'goalID' | 'scoreTeam1' | 'scoreTeam2'>): OldbGoal {
  return {
    matchMinute: 10,
    goalGetterID: null,
    goalGetterName: 'Player',
    scoringTeamId: null,
    isPenalty: false,
    isOwnGoal: false,
    isOvertime: false,
    comment: null,
    ...partial,
  }
}

describe('team name normalisation', () => {
  it('strips diacritics, umlauts and punctuation', () => {
    expect(normaliseName('Borussia Mönchengladbach')).toBe('borussia monchengladbach')
    expect(normaliseName('1. FC Köln')).toBe('1 fc koln')
    expect(normaliseName('FK Bodø/Glimt')).toBe('fk bodo glimt')
    expect(normaliseName("M'gladbach")).toBe('mgladbach')
  })

  it('drops club-form tokens and numbers as whole tokens only', () => {
    expect(nameCore('1. FC Köln')).toBe('koln')
    expect(nameCore('TSG 1899 Hoffenheim')).toBe('hoffenheim')
    expect(nameCore('SV 07 Elversberg')).toBe('elversberg')
    expect(nameCore('VfB Stuttgart')).toBe('stuttgart')
    // "Schalke" keeps its letters even though "sc" is a noise token.
    expect(nameCore('FC Schalke 04')).toBe('schalke')
  })

  it('reconciles aliases on both sides', () => {
    expect(teamKey('Bayern Munich')).toBe(teamKey('FC Bayern München'))
    expect(teamKey('Gladbach')).toBe(teamKey('Borussia Mönchengladbach'))
    expect(teamKey("M'gladbach")).toBe(teamKey('Borussia Mönchengladbach'))
    expect(teamKey('Cologne')).toBe(teamKey('1. FC Köln'))
    expect(teamKey('Bayer Leverkusen')).toBe(teamKey('Bayer 04 Leverkusen'))
    expect(teamKey('TSG Hoffenheim')).toBe(teamKey('TSG 1899 Hoffenheim'))
    expect(teamKey('Inter Mailand')).toBe(teamKey('FC Internazionale Milano'))
  })
})

describe('matchTeam', () => {
  // Every OpenLigaDB Bundesliga 2026/27 name, verbatim, with our expected id.
  const upstream: [string, string, number][] = [
    ['FC Bayern München', 'Bayern', 5],
    ['VfB Stuttgart', 'Stuttgart', 10],
    ['RB Leipzig', 'Leipzig', 721],
    ['Borussia Mönchengladbach', 'Gladbach', 18],
    ['1. FSV Mainz 05', 'Mainz', 15],
    ['SC Paderborn 07', 'Paderborn', 29],
    ['1. FC Union Berlin', 'Union Berlin', 28],
    ['Eintracht Frankfurt', 'Frankfurt', 19],
    ['1. FC Köln', 'Köln', 1],
    ['TSG Hoffenheim', 'Hoffenheim', 2],
    ['SV 07 Elversberg', 'Elversberg', 719],
    ['Bayer 04 Leverkusen', 'Leverkusen', 3],
    ['Borussia Dortmund', 'Dortmund', 4],
    ['Hamburger SV', 'HSV', 7],
    ['SC Freiburg', 'Freiburg', 17],
    ['SV Werder Bremen', 'Bremen', 12],
    ['FC Augsburg', 'Augsburg', 16],
    ['FC Schalke 04', 'S04', 6],
  ]

  it.each(upstream)('maps %s', (teamName, shortName, id) => {
    expect(matchTeam({ teamName, shortName }, BL1)).toEqual({ id })
  })

  it('never guesses: an unknown club is unmatched', () => {
    expect(matchTeam({ teamName: 'Holstein Kiel', shortName: 'Kiel' }, BL1)).toEqual({
      id: null,
      reason: 'none',
    })
  })

  it('reports ambiguity instead of picking one', () => {
    const twins: CandidateTeam[] = [
      { id: 1, name: 'FC Example', shortName: null },
      { id: 2, name: 'SV Example', shortName: null },
    ]
    expect(matchTeam({ teamName: 'Example', shortName: null }, twins)).toEqual({
      id: null,
      reason: 'ambiguous',
    })
  })

  it('does not match on a substring', () => {
    expect(matchTeam({ teamName: 'Borussia', shortName: null }, BL1).id).toBeNull()
  })
})

describe('parseGoalMinute', () => {
  it('reads a plain minute', () => {
    expect(parseGoalMinute({ matchMinute: 57, isOvertime: false, comment: null })).toEqual({
      minute: 57,
      addedTime: null,
    })
  })

  it('reads stoppage time written as an absolute minute', () => {
    expect(parseGoalMinute({ matchMinute: 92, isOvertime: true, comment: null })).toEqual({ minute: 90, addedTime: 2 })
    expect(parseGoalMinute({ matchMinute: 103, isOvertime: true, comment: null })).toEqual({ minute: 90, addedTime: 13 })
    expect(parseGoalMinute({ matchMinute: 46, isOvertime: true, comment: null })).toEqual({ minute: 45, addedTime: 1 })
  })

  it('reads "+11" from the comment', () => {
    expect(parseGoalMinute({ matchMinute: 90, isOvertime: true, comment: '+11' })).toEqual({ minute: 90, addedTime: 11 })
    expect(parseGoalMinute({ matchMinute: 101, isOvertime: false, comment: '+11' })).toEqual({ minute: 90, addedTime: 11 })
  })

  it('ignores free-text comments', () => {
    expect(parseGoalMinute({ matchMinute: 54, isOvertime: false, comment: 'Fabian Rieder' })).toEqual({
      minute: 54,
      addedTime: null,
    })
  })

  it('places extra-time stoppage on 105/120 only where extra time exists', () => {
    expect(parseGoalMinute({ matchMinute: 107, isOvertime: true, comment: null }, true)).toEqual({ minute: 105, addedTime: 2 })
    expect(parseGoalMinute({ matchMinute: 107, isOvertime: true, comment: null }, false)).toEqual({ minute: 90, addedTime: 17 })
  })

  it('rejects impossible minutes rather than storing them', () => {
    expect(parseGoalMinute({ matchMinute: 400, isOvertime: false, comment: null })).toEqual({ minute: null, addedTime: null })
    expect(parseGoalMinute({ matchMinute: null, isOvertime: false, comment: null })).toEqual({ minute: null, addedTime: null })
  })
})

describe('goalType', () => {
  it('maps the flags', () => {
    expect(goalType({ isOwnGoal: false, isPenalty: false })).toBe('GOAL')
    expect(goalType({ isOwnGoal: false, isPenalty: true })).toBe('PENALTY_GOAL')
    expect(goalType({ isOwnGoal: true, isPenalty: false })).toBe('OWN_GOAL')
    expect(goalType({ isOwnGoal: true, isPenalty: true })).toBe('OWN_GOAL')
  })
})

describe('crediting goals from the running score', () => {
  it('credits the side whose score went up', () => {
    const credited = creditGoals(
      [goal({ goalID: 2, scoreTeam1: 1, scoreTeam2: 1 }), goal({ goalID: 1, scoreTeam1: 1, scoreTeam2: 0 })],
      40,
      16
    )
    expect(credited.map((c) => [c.goal.goalID, c.side])).toEqual([
      [1, 1],
      [2, 2],
    ])
  })

  it('credits an own goal to the side it counted for, not the scorer’s club', () => {
    // Real case: Bayern 3-1 Stuttgart, Vagnoman (Stuttgart) own goal.
    const [og] = creditGoals(
      [goal({ goalID: 146254, scoreTeam1: 1, scoreTeam2: 0, isOwnGoal: true, goalGetterName: 'J. Vagnoman', scoringTeamId: 40 })],
      40,
      16
    )
    expect(og.side).toBe(1)
  })

  it('falls back to scoringTeamId on a running-score jump, and says so', () => {
    const [g] = creditGoals([goal({ goalID: 9, scoreTeam1: 2, scoreTeam2: 0, scoringTeamId: 16 })], 40, 16)
    expect(g.side).toBe(2)
    expect(g.warning).toMatch(/jumped/)
  })

  it('trusts the running score over a contradicting scoringTeamId', () => {
    const [g] = creditGoals([goal({ goalID: 9, scoreTeam1: 1, scoreTeam2: 0, scoringTeamId: 16 })], 40, 16)
    expect(g.side).toBe(1)
    expect(g.warning).toMatch(/disagrees/)
  })
})

describe('planGoalRows: home/away mapping', () => {
  const upstream = {
    team1: { teamId: 40, teamName: 'FC Bayern München', shortName: 'Bayern' },
    team2: { teamId: 16, teamName: 'VfB Stuttgart', shortName: 'Stuttgart' },
    goals: [
      goal({ goalID: 1, scoreTeam1: 1, scoreTeam2: 0, matchMinute: 21 }),
      goal({ goalID: 2, scoreTeam1: 1, scoreTeam2: 1, matchMinute: 52 }),
      goal({ goalID: 3, scoreTeam1: 2, scoreTeam2: 1, matchMinute: 57, isOwnGoal: true }),
      goal({ goalID: 4, scoreTeam1: 3, scoreTeam2: 1, matchMinute: 92, isOvertime: true, isPenalty: true }),
    ],
  }

  it('keeps the order when team1 is our home side', () => {
    const { rows } = planGoalRows(upstream, { id: 99, homeTeamId: 5, awayTeamId: 10 }, 5, false)
    expect(rows.map((r) => [r.providerEventId, r.teamId, r.scoreHome, r.scoreAway, r.type])).toEqual([
      ['1', 5, 1, 0, 'GOAL'],
      ['2', 10, 1, 1, 'GOAL'],
      ['3', 5, 2, 1, 'OWN_GOAL'],
      ['4', 5, 3, 1, 'PENALTY_GOAL'],
    ])
    expect(rows[3]).toMatchObject({ minute: 90, addedTime: 2 })
  })

  it('swaps scores and sides when team1 is our away side', () => {
    const { rows } = planGoalRows(upstream, { id: 99, homeTeamId: 10, awayTeamId: 5 }, 5, false)
    expect(rows.map((r) => [r.teamId, r.scoreHome, r.scoreAway])).toEqual([
      [5, 0, 1],
      [10, 1, 1],
      [5, 1, 2],
      [5, 1, 3],
    ])
  })
})

describe('matchFixture', () => {
  const ours: OurMatch[] = [
    { id: 1, homeTeamId: 5, awayTeamId: 10, utcDate: new Date('2026-08-28T18:30:00Z'), status: 'FINISHED', homeScoreFt: 5, awayScoreFt: 1 },
    { id: 2, homeTeamId: 10, awayTeamId: 5, utcDate: new Date('2027-01-20T14:30:00Z'), status: 'TIMED', homeScoreFt: null, awayScoreFt: null },
  ]

  it('maps when teams and kickoff agree', () => {
    expect(matchFixture(new Date('2026-08-28T18:30:00Z'), 5, 10, ours)).toEqual({ id: 1, swapped: false })
  })

  it('tolerates a kickoff moved by up to 36 hours', () => {
    expect(matchFixture(new Date('2026-08-30T06:00:00Z'), 5, 10, ours)).toEqual({ id: 1, swapped: false })
    expect(matchFixture(new Date('2026-08-30T07:00:00Z'), 5, 10, ours)).toEqual({ id: null, reason: 'none' })
  })

  it('does not confuse the reverse fixture months apart', () => {
    expect(matchFixture(new Date('2027-01-20T14:30:00Z'), 5, 10, ours)).toEqual({ id: 2, swapped: true })
  })
})

describe('findScoreMismatch', () => {
  const finished: OurMatch = {
    id: 7, homeTeamId: 5, awayTeamId: 10, utcDate: new Date(), status: 'FINISHED', homeScoreFt: 2, awayScoreFt: 1,
  }

  it('is quiet when the tally agrees', () => {
    expect(findScoreMismatch(finished, true, [{ teamId: 5 }, { teamId: 10 }, { teamId: 5 }])).toBeNull()
  })

  it('reports a disagreement without touching our score', () => {
    expect(findScoreMismatch(finished, true, [{ teamId: 5 }, { teamId: 10 }])).toEqual({
      matchId: 7,
      ours: { home: 2, away: 1 },
      goals: { home: 1, away: 1, unattributed: 0 },
    })
    expect(finished.homeScoreFt).toBe(2)
  })

  it('counts goals it could not attribute as a disagreement', () => {
    expect(findScoreMismatch(finished, true, [{ teamId: 5 }, { teamId: 10 }, { teamId: null }])?.goals.unattributed).toBe(1)
  })

  it('compares only matches finished on both sides', () => {
    expect(findScoreMismatch(finished, false, [])).toBeNull()
    expect(findScoreMismatch({ ...finished, status: 'IN_PLAY' }, true, [])).toBeNull()
  })
})

describe('etiquette guard', () => {
  const now = Date.parse('2026-11-28T15:00:00Z')

  it('allows the first request ever', () => {
    expect(slotDecision(null, now).allowed).toBe(true)
  })

  it('enforces the minimum interval', () => {
    const recent = { lastAttemptAt: new Date(now - 20_000), consecutiveFailures: 0 }
    expect(slotDecision(recent, now)).toEqual({ allowed: false, waitMs: MIN_INTERVAL_MS - 20_000 })
    const old = { lastAttemptAt: new Date(now - MIN_INTERVAL_MS), consecutiveFailures: 0 }
    expect(slotDecision(old, now).allowed).toBe(true)
  })

  it('backs off exponentially after failures, capped', () => {
    const twoFailures = { lastAttemptAt: new Date(now - 3 * MIN_INTERVAL_MS), consecutiveFailures: 2 }
    expect(slotDecision(twoFailures, now).allowed).toBe(false) // needs 4x
    const many = { lastAttemptAt: new Date(now - MAX_BACKOFF_MS), consecutiveFailures: 30 }
    expect(slotDecision(many, now).allowed).toBe(true)
  })

  it('names the app in the User-Agent and sanitises an optional contact', () => {
    expect(userAgent(undefined)).toBe('90MinTactics/1.0 (football scores app)')
    expect(userAgent('ops@example.org\r\nX-Evil: 1')).toBe(
      '90MinTactics/1.0 (football scores app; ops@example.orgX-Evil: 1)'
    )
  })
})

describe('payload helpers', () => {
  it('keeps valid matches and counts invalid ones', () => {
    const valid = {
      matchID: 1,
      matchDateTimeUTC: '2026-08-28T18:30:00Z',
      team1: { teamId: 40, teamName: 'FC Bayern München', shortName: 'Bayern' },
      team2: { teamId: 16, teamName: 'VfB Stuttgart', shortName: 'Stuttgart' },
      matchIsFinished: true,
      goals: [],
    }
    expect(parseMatches([valid, { matchID: 'x' }])).toMatchObject({ invalid: 1, matches: [{ matchID: 1 }] })
  })

  it('reads zone-less change dates consistently', () => {
    expect(changeDateToTimestamp('2026-11-20T12:07:02.16')?.toISOString()).toBe('2026-11-20T12:07:02.160Z')
    expect(changeDateToTimestamp('garbage')).toBeNull()
  })

  it('names seasons by their starting year', () => {
    expect(seasonFor(new Date('2026-11-28T00:00:00Z'))).toBe(2026)
    expect(seasonFor(new Date('2027-03-01T00:00:00Z'))).toBe(2026)
    expect(seasonFor(new Date('2027-07-01T00:00:00Z'))).toBe(2027)
  })
})
