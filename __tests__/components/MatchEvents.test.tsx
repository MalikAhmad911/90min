import { render, screen } from '@testing-library/react'
import { MatchEvents, formatMinute, type MatchWithEvents } from '@/components/match/MatchEvents'
import { ScorersSummary, scorerLines } from '@/components/match/ScorersSummary'
import type { MatchGoal } from '@/lib/types'

const attribution = {
  provider: 'OpenLigaDB',
  text: 'Goal data from OpenLigaDB (www.openligadb.de), licensed under ODbL 1.0',
  url: 'https://www.openligadb.de',
  license: 'ODbL-1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
} as const

function g(
  minute: number,
  injuryTime: number | null,
  teamId: number,
  name: string,
  type = 'REGULAR',
  cancelled = false
): MatchGoal & { cancelled: boolean } {
  return {
    minute,
    injuryTime,
    type,
    team: { id: teamId, name: teamId === 5 ? 'FC Bayern München' : 'VfB Stuttgart' },
    scorer: { id: 0, name },
    assist: null,
    score: { home: null, away: null },
    cancelled,
  }
}

const base: MatchWithEvents = {
  id: 1,
  status: 'FINISHED',
  utcDate: '2026-08-28T18:30:00Z',
  homeTeam: { id: 5, name: 'FC Bayern München', shortName: 'Bayern', tla: 'FCB', crest: '' },
  awayTeam: { id: 10, name: 'VfB Stuttgart', shortName: 'Stuttgart', tla: 'VFB', crest: '' },
  score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
  competition: { id: 2002, name: 'Bundesliga', code: 'BL1', emblem: '' },
}

describe('MatchEvents', () => {
  it('renders goals with type labels, stoppage time and attribution', () => {
    render(
      <MatchEvents
        match={{
          ...base,
          goalCoverage: 'match',
          attribution,
          goals: [g(21, null, 5, 'D. Upamecano'), g(57, null, 5, 'J. Vagnoman', 'OWN'), g(90, 11, 10, 'E. Demirović', 'PENALTY')],
        }}
      />
    )
    expect(screen.getByText('D. Upamecano')).toBeInTheDocument()
    expect(screen.getByText('own goal')).toBeInTheDocument()
    expect(screen.getByText('penalty')).toBeInTheDocument()
    expect(screen.getByText('90+11′')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ODbL 1.0' })).toHaveAttribute('href', attribution.licenseUrl)
  })

  it('strikes through a disallowed goal and says so to screen readers', () => {
    render(
      <MatchEvents
        match={{ ...base, goalCoverage: 'match', attribution, goals: [g(30, null, 5, 'H. Kane', 'REGULAR', true)] }}
      />
    )
    expect(screen.getByText('H. Kane')).toHaveClass('line-through')
    expect(screen.getByLabelText(/^Disallowed goal: Goal, H\. Kane, Bayern, 30′$/)).toBeInTheDocument()
  })

  it('is honest about competitions without coverage', () => {
    render(<MatchEvents match={{ ...base, competition: { ...base.competition, code: 'PL' }, goalCoverage: 'none' }} />)
    expect(screen.getByText('Goal timeline isn’t available for this competition yet')).toBeInTheDocument()
    expect(screen.queryByText(/OpenLigaDB/)).not.toBeInTheDocument()
  })

  it('says "no goals" only when the match is covered and goalless', () => {
    render(
      <MatchEvents
        match={{ ...base, score: { fullTime: { home: 0, away: 0 }, halfTime: { home: 0, away: 0 } }, goalCoverage: 'match', attribution }}
      />
    )
    expect(screen.getByText('No goals in this match')).toBeInTheDocument()
    expect(screen.getByText('OpenLigaDB')).toBeInTheDocument()
  })

  it('flags a goal list that does not add up to the score', () => {
    render(
      <MatchEvents
        match={{ ...base, goalCoverage: 'match', attribution, goalsDisagreeWithScore: true, goals: [g(21, null, 5, 'D. Upamecano')] }}
      />
    )
    expect(screen.getByRole('note')).toHaveTextContent('doesn’t add up')
  })
})

describe('formatMinute', () => {
  it('formats regular and stoppage minutes', () => {
    expect(formatMinute(57, null)).toBe('57′')
    expect(formatMinute(90, 11)).toBe('90+11′')
  })
})

describe('ScorersSummary', () => {
  const goals = [
    g(55, null, 5, 'M. Olise'),
    g(21, null, 5, 'D. Upamecano'),
    g(70, null, 5, 'M. Olise', 'PENALTY'),
    g(57, null, 5, 'J. Vagnoman', 'OWN'),
    g(80, null, 10, 'D. Undav', 'REGULAR', true),
    g(52, null, 10, 'J. Vagnoman'),
  ]

  it('groups by scorer in order, with (P) and (OG), skipping disallowed goals', () => {
    expect(scorerLines(goals, 5)).toEqual([
      { name: 'D. Upamecano', marks: ['21′'] },
      { name: 'M. Olise', marks: ['55′', '70′ (P)'] },
      { name: 'J. Vagnoman', marks: ['57′ (OG)'] },
    ])
    expect(scorerLines(goals, 10)).toEqual([{ name: 'J. Vagnoman', marks: ['52′'] }])
  })

  it('renders a list per team', () => {
    render(<ScorersSummary match={{ ...base, goals }} />)
    expect(screen.getByRole('list', { name: 'Bayern scorers' })).toHaveTextContent('M. Olise 55′, 70′ (P)')
    expect(screen.getByRole('list', { name: 'Stuttgart scorers' })).not.toHaveTextContent('Undav')
  })

  it('renders nothing without goals', () => {
    const { container } = render(<ScorersSummary match={{ ...base, goals: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
