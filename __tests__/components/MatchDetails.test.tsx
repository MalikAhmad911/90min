import { render, screen, fireEvent, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MatchEvents, type MatchWithEvents } from '@/components/match/MatchEvents'
import { MatchStats } from '@/components/match/MatchStats'
import { MatchLineups, pitchName } from '@/components/match/MatchLineups'
import { MatchDetailView } from '@/components/match/MatchDetailView'
import { MatchCard } from '@/components/home/MatchCard'
import type { MatchDetail, MatchLineupsData, MatchStatLine, MatchTimelineEvent } from '@/lib/types'

const base: MatchDetail = {
  id: 560642,
  status: 'FINISHED',
  utcDate: '2026-11-21T15:00:00Z',
  homeTeam: { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crest: '' },
  awayTeam: { id: 341, name: 'Leeds United FC', shortName: 'Leeds United', tla: 'LEE', crest: '' },
  score: { fullTime: { home: 1, away: 4 }, halfTime: { home: 1, away: 1 } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: '' },
}

function ev(partial: Partial<MatchTimelineEvent>): MatchTimelineEvent {
  return {
    type: 'GOAL',
    minute: 25,
    addedTime: null,
    side: 'home',
    player: 'Emanuel Emegha',
    related: null,
    detail: null,
    cancelled: false,
    ...partial,
  }
}

const events: MatchTimelineEvent[] = [
  ev({ related: 'Morgan Rogers' }),
  ev({ type: 'PENALTY_GOAL', minute: 53, side: 'away', player: 'Dominic Calvert-Lewin' }),
  ev({ type: 'OWN_GOAL', minute: 60, side: 'away', player: 'Levi Colwill' }),
  ev({ type: 'YELLOW_CARD', minute: 38, side: 'away', player: 'Gabriel Gudmundsson' }),
  ev({ type: 'SECOND_YELLOW', minute: 70, side: 'away', player: 'Jayden Bogle' }),
  ev({ type: 'RED_CARD', minute: 80, side: 'home', player: 'Romeo Lavia' }),
  ev({ type: 'SUBSTITUTION', minute: 64, side: 'home', player: 'Danny Welbeck', related: 'Emanuel Emegha' }),
  ev({ type: 'MISSED_PENALTY', minute: 75, side: 'home', player: 'Cole Palmer' }),
  ev({ type: 'VAR', minute: 88, side: 'home', player: 'Pedro Neto', detail: 'VAR Goal Cancelled - Offside' }),
  ev({ type: 'GOAL', minute: 90, addedTime: 1, side: 'away', player: 'Brenden Aaronson', related: 'Harry Wilson' }),
]

const statistics: MatchStatLine[] = [
  { key: 'possession', label: 'Possession', home: 57, away: 43, format: 'percent' },
  { key: 'xg', label: 'Expected goals (xG)', home: 0.64, away: 2.77, format: 'decimal' },
  { key: 'shots', label: 'Total shots', home: 14, away: 21, format: 'count' },
]

const lineups: MatchLineupsData = {
  home: {
    formation: '4-2-3-1',
    rows: [
      [{ name: 'E. Martínez', number: 1, position: 'Goalkeeper' }],
      [{ name: 'Pedro Neto', number: 7, position: 'Forward' }],
    ],
    bench: [{ name: 'D. Welbeck', number: 18, position: 'Forward' }],
  },
  away: {
    formation: '3-4-2-1',
    rows: [[{ name: 'J. Trafford', number: 1, position: 'Goalkeeper' }]],
    bench: [],
  },
}

const M = '′' // the prime the timeline uses after minutes

describe('MatchEvents with a provider timeline', () => {
  it('renders every event kind in minute order with the Highlightly attribution', () => {
    const match: MatchWithEvents = { ...base, events, detailsSource: 'highlightly', goalCoverage: 'match' }
    render(<MatchEvents match={match} />)
    const items = within(screen.getByRole('list', { name: 'Match timeline' })).getAllByRole('listitem')
    expect(items).toHaveLength(events.length)
    const labels = items.map((li) => li.getAttribute('aria-label'))
    expect(labels[0]).toBe(`Goal, Emanuel Emegha, Chelsea, 25${M}`)
    expect(labels).toContain(`Goal (penalty), Dominic Calvert-Lewin, Leeds United, 53${M}`)
    expect(labels).toContain(`Goal (own goal), Levi Colwill, Leeds United, 60${M}`)
    expect(labels).toContain(`Second yellow card, Jayden Bogle, Leeds United, 70${M}`)
    expect(labels).toContain(`Red card, Romeo Lavia, Chelsea, 80${M}`)
    expect(labels).toContain(`Substitution, Chelsea, 64${M}: Danny Welbeck on for Emanuel Emegha`)
    expect(labels).toContain(`Missed penalty, Cole Palmer, Chelsea, 75${M}`)
    expect(labels).toContain(`VAR Goal Cancelled - Offside, Pedro Neto, Chelsea, 88${M}`)
    expect(labels[labels.length - 1]).toBe(`Goal, Brenden Aaronson, Leeds United, 90+1${M}`)
    expect(screen.getByText('assist: Morgan Rogers')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Highlightly' })).toHaveAttribute('href', 'https://highlightly.net')
  })
})

describe('MatchStats with normalised statistics', () => {
  it('renders paired lines including xG, with attribution', () => {
    render(<MatchStats match={{ ...base, statistics, detailsSource: 'highlightly' }} />)
    expect(screen.getByLabelText('Possession: Chelsea 57%, Leeds United 43%')).toBeInTheDocument()
    expect(screen.getByLabelText('Expected goals (xG): Chelsea 0.64, Leeds United 2.77')).toBeInTheDocument()
    expect(screen.getByText(/Match data:/)).toBeInTheDocument()
  })

  it('keeps the empty state without data', () => {
    render(<MatchStats match={base} />)
    expect(screen.getByText('No statistics available')).toBeInTheDocument()
  })
})

describe('MatchLineups with provider lineups', () => {
  it('draws formations, starters and benches', () => {
    render(<MatchLineups home={base.homeTeam} away={base.awayTeam} lineups={lineups} source="highlightly" />)
    expect(screen.getByText('4-2-3-1')).toBeInTheDocument()
    expect(screen.getByText('3-4-2-1')).toBeInTheDocument()
    expect(screen.getByLabelText('Chelsea starting XI')).toBeInTheDocument()
    expect(screen.getByLabelText('7 Pedro Neto')).toBeInTheDocument()
    expect(screen.getByText('D. Welbeck')).toBeInTheDocument()
    expect(screen.getByText(/Match data:/)).toBeInTheDocument()
    expect(pitchName('Joshua Kofi Acheampong')).toBe('Acheampong')
    expect(pitchName('E. Martínez')).toBe('E. Martínez')
  })
})

describe('MatchDetailView tabs', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))))
  afterEach(() => vi.unstubAllGlobals())

  function view(match: MatchDetail) {
    return render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MatchDetailView id={String(match.id)} initialData={{ match, headToHead: [] }} />
      </SWRConfig>
    )
  }

  it('hides Lineups and Stats when there is no data', () => {
    view(base)
    expect(screen.queryByRole('button', { name: 'Lineups' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stats' })).toBeNull()
    expect(screen.getByRole('button', { name: 'H2H' })).toBeInTheDocument()
  })

  it('shows them, and their content, when data exists', () => {
    view({ ...base, lineups, statistics, detailsSource: 'highlightly' } as MatchDetail)
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.getByText('Expected goals (xG)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lineups' }))
    expect(screen.getByText('4-2-3-1')).toBeInTheDocument()
  })
})

describe('MatchCard red cards (MAT-4)', () => {
  it('marks red cards per side and nothing otherwise', () => {
    const { rerender } = render(<MatchCard match={{ ...base, redCards: { home: 0, away: 2 } }} />)
    expect(screen.getByText('2 red cards')).toBeInTheDocument()
    expect(screen.queryByText('1 red card')).toBeNull()
    rerender(<MatchCard match={base} />)
    expect(screen.queryByText(/red card/)).toBeNull()
  })
})
