import {
  buildStandingsView,
  compareStandingRows,
  computeForm,
  computeVenueTable,
  formString,
  matchesForTable,
  resultFor,
  type FinishedMatch,
} from '@/lib/standings-splits'
import { standingsViewSchema } from '@/lib/db/league-queries'
import type { StandingRow, StandingsTable, Team } from '@/lib/types'

const team = (id: number, name: string): Team => ({ id, name, shortName: name, tla: name.slice(0, 3).toUpperCase(), crest: '' })

const ARS = team(57, 'Arsenal')
const CHE = team(61, 'Chelsea')
const LIV = team(64, 'Liverpool')
const TOT = team(73, 'Tottenham')

let nextId = 1
function played(day: number, home: Team, homeGoals: number, awayGoals: number, away: Team, stage = 'REGULAR_SEASON'): FinishedMatch {
  return {
    id: nextId++,
    utcDate: new Date(Date.UTC(2026, 7, day, 15)).toISOString(),
    stage,
    homeTeam: home,
    awayTeam: away,
    homeGoals,
    awayGoals,
  }
}

function totalRow(position: number, t: Team, form: string | null = null): StandingRow {
  return {
    position,
    team: t,
    playedGames: 0,
    form,
    won: 0,
    draw: 0,
    lost: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  }
}

describe('resultFor', () => {
  it('scores a win, a loss and a draw', () => {
    expect(resultFor(2, 1)).toBe('W')
    expect(resultFor(0, 3)).toBe('L')
    expect(resultFor(1, 1)).toBe('D')
  })
})

describe('computeForm', () => {
  it('lists the last five results oldest first, most recent last, from either side', () => {
    const matches = [
      played(1, ARS, 2, 0, CHE), // W
      played(2, LIV, 1, 1, ARS), // D
      played(3, ARS, 0, 1, TOT), // L
      played(4, CHE, 0, 3, ARS), // W
      played(5, ARS, 2, 2, LIV), // D
      played(6, TOT, 2, 1, ARS), // L - most recent
    ]
    expect(computeForm(matches, ARS.id)).toEqual(['D', 'L', 'W', 'D', 'L'])
    expect(formString(computeForm(matches, ARS.id))).toBe('D,L,W,D,L')
  })

  it('orders by kick-off, not by the order rows arrive in', () => {
    const late = played(9, ARS, 0, 1, CHE)
    const early = played(1, ARS, 3, 0, CHE)
    expect(computeForm([late, early], ARS.id)).toEqual(['W', 'L'])
  })

  it('returns a shorter guide for a team with fewer than five games', () => {
    const matches = [played(1, ARS, 1, 1, CHE), played(2, CHE, 0, 2, LIV)]
    expect(computeForm(matches, CHE.id)).toEqual(['D', 'L'])
    expect(computeForm(matches, TOT.id)).toEqual([])
    expect(formString([])).toBeNull()
  })

  it('can be limited to home or away games', () => {
    const matches = [played(1, ARS, 1, 0, CHE), played(2, CHE, 1, 0, ARS), played(3, ARS, 0, 0, LIV)]
    expect(computeForm(matches, ARS.id, { venue: 'home' })).toEqual(['W', 'D'])
    expect(computeForm(matches, ARS.id, { venue: 'away' })).toEqual(['L'])
  })
})

describe('compareStandingRows', () => {
  const row = (t: Team, points: number, goalsFor: number, goalsAgainst: number): StandingRow => ({
    ...totalRow(0, t),
    points,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
  })

  it('ranks by points, then goal difference, then goals scored, then name', () => {
    const rows = [
      row(TOT, 6, 3, 3), // 6 pts, GD 0, GF 3
      row(LIV, 6, 5, 5), // 6 pts, GD 0, GF 5  -> above Tottenham on goals scored
      row(CHE, 6, 4, 1), // 6 pts, GD +3       -> top of the 6-point group
      row(ARS, 7, 1, 4), // most points wins outright despite GD -3
      row(team(1, 'Aston Villa'), 6, 3, 3), // identical to Tottenham -> name decides
    ]
    expect(rows.sort(compareStandingRows).map((r) => r.team.name)).toEqual([
      'Arsenal',
      'Chelsea',
      'Liverpool',
      'Aston Villa',
      'Tottenham',
    ])
  })
})

describe('computeVenueTable', () => {
  const matches = [
    played(1, ARS, 2, 0, CHE),
    played(2, CHE, 1, 1, LIV), // a draw at Chelsea
    played(3, LIV, 3, 1, ARS),
    played(4, ARS, 1, 1, LIV), // a draw at Arsenal
  ]

  it('builds a full home table with P W D L GF GA GD Pts and positions', () => {
    const home = computeVenueTable(matches, 'home', [ARS, CHE, LIV, TOT])
    // [#, team, P, W, D, L, GF, GA, GD, Pts]
    expect(
      home.map((r) => [r.position, r.team.name, r.playedGames, r.won, r.draw, r.lost, r.goalsFor, r.goalsAgainst, r.goalDifference, r.points])
    ).toEqual([
      [1, 'Arsenal', 2, 1, 1, 0, 3, 1, 2, 4],
      [2, 'Liverpool', 1, 1, 0, 0, 3, 1, 2, 3],
      [3, 'Chelsea', 1, 0, 1, 0, 1, 1, 0, 1],
      [4, 'Tottenham', 0, 0, 0, 0, 0, 0, 0, 0],
    ])
  })

  it('counts each match once, for the away side only, in the away table', () => {
    const away = computeVenueTable(matches, 'away', [ARS, CHE, LIV, TOT])
    const byName = Object.fromEntries(away.map((r) => [r.team.name, r]))
    expect(byName.Arsenal).toMatchObject({ playedGames: 1, lost: 1, goalsFor: 1, goalsAgainst: 3, points: 0 })
    expect(byName.Liverpool).toMatchObject({ playedGames: 2, draw: 2, goalsFor: 2, goalsAgainst: 2, points: 2 })
    expect(byName.Chelsea).toMatchObject({ playedGames: 1, lost: 1, points: 0 })
    expect(byName.Tottenham).toMatchObject({ playedGames: 0, form: null })
    expect(away.reduce((n, r) => n + r.playedGames, 0)).toBe(matches.length)
  })

  it('gives each row its form at that venue only', () => {
    const home = computeVenueTable(matches, 'home', [ARS])
    expect(home.find((r) => r.team.id === ARS.id)!.form).toBe('W,D')
  })

  it('adds a team that is not in the seed list when it has played', () => {
    expect(computeVenueTable(matches, 'home').map((r) => r.team.id).sort()).toEqual([ARS.id, CHE.id, LIV.id].sort())
  })
})

describe('matchesForTable', () => {
  it('keeps a group table to its own teams and stage', () => {
    const groupA: StandingsTable = {
      stage: 'GROUP_STAGE',
      type: 'TOTAL',
      group: 'GROUP_A',
      table: [totalRow(1, ARS), totalRow(2, CHE)],
    }
    const inGroup = played(1, ARS, 1, 0, CHE, 'GROUP_STAGE')
    const otherGroup = played(1, LIV, 1, 0, TOT, 'GROUP_STAGE')
    const knockout = played(9, ARS, 2, 1, CHE, 'QUARTER_FINALS')
    expect(matchesForTable(groupA, [inGroup, otherGroup, knockout])).toEqual([inGroup])
  })
})

describe('buildStandingsView', () => {
  const table: StandingsTable = {
    stage: 'REGULAR_SEASON',
    type: 'TOTAL',
    group: 'Matchday',
    table: [totalRow(1, ARS), totalRow(2, CHE, 'L,L,L,L,L'), totalRow(3, LIV)],
  }
  const matches = [played(1, ARS, 2, 0, CHE), played(2, LIV, 1, 1, ARS)]

  it('fills form only where the provider left it null, and keeps the table otherwise unchanged', () => {
    const [total] = buildStandingsView([table], matches, 'total')
    expect(total.type).toBe('TOTAL')
    expect(total.group).toBe('Matchday')
    expect(total.table.map((r) => [r.position, r.team.name, r.form])).toEqual([
      [1, 'Arsenal', 'W,D'],
      [2, 'Chelsea', 'L,L,L,L,L'], // provider's own form is kept
      [3, 'Liverpool', 'D'],
    ])
  })

  it('computes HOME and AWAY tables seeded with every team of the league', () => {
    const [home] = buildStandingsView([table], matches, 'home')
    const [away] = buildStandingsView([table], matches, 'away')
    expect(home).toMatchObject({ type: 'HOME', stage: 'REGULAR_SEASON', group: 'Matchday' })
    expect(away.type).toBe('AWAY')
    expect(home.table).toHaveLength(3)
    expect(home.table[0].team.name).toBe('Arsenal')
    expect(away.table[0]).toMatchObject({ team: { name: 'Arsenal' }, points: 1 })
  })

  it('prefers split tables the provider sent itself', () => {
    const providerHome: StandingsTable = { ...table, type: 'HOME' }
    expect(buildStandingsView([table, providerHome], matches, 'home')).toEqual([providerHome])
  })
})

describe('standingsViewSchema', () => {
  it('defaults to the overall table and allow-lists the views', () => {
    expect(standingsViewSchema.parse(undefined)).toBe('total')
    expect(standingsViewSchema.parse('home')).toBe('home')
    expect(standingsViewSchema.parse('away')).toBe('away')
    expect(standingsViewSchema.safeParse('HOME').success).toBe(false)
    expect(standingsViewSchema.safeParse('form').success).toBe(false)
  })
})
