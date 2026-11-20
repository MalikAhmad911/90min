import { render, screen } from '@testing-library/react'
import { MatchCard } from '@/components/home/MatchCard'
import type { Match } from '@/lib/types'

const liveMatch: Match = {
  id: 1,
  status: 'IN_PLAY',
  utcDate: '2026-06-19T15:00:00Z',
  minute: 67,
  homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: 'https://crests.football-data.org/64.png' },
  awayTeam: { id: 2, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://crests.football-data.org/57.png' },
  score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: 'pl.png' },
}

const scheduledMatch: Match = {
  ...liveMatch,
  id: 2,
  status: 'SCHEDULED',
  minute: undefined,
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
}

const finishedMatch: Match = {
  ...liveMatch,
  id: 3,
  status: 'FINISHED',
  minute: undefined,
  score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
}

describe('MatchCard', () => {
  it('renders both team names', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText('Liverpool')).toBeInTheDocument()
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  // The card renders both goal counts inside one node ("2 - 1"), so the score
  // is matched as a whole rather than as two separate elements.
  it('renders score for live match', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText(/2\s*-\s*1/)).toBeInTheDocument()
  })

  // Live state is shown FotMob-style, as the current minute in the left
  // column - there is deliberately no "LIVE" badge on the card.
  it('shows the current minute for an in-play match', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText("67'")).toBeInTheDocument()
  })

  it('shows HT for a match at half time', () => {
    render(<MatchCard match={{ ...liveMatch, status: 'PAUSED' }} />)
    expect(screen.getByText('HT')).toBeInTheDocument()
  })

  it('shows kickoff time for SCHEDULED match', () => {
    render(<MatchCard match={scheduledMatch} />)
    expect(screen.getByText(/^\d{1,2}:\d{2}/)).toBeInTheDocument()
    expect(screen.queryByText("67'")).not.toBeInTheDocument()
  })

  it('shows FT for FINISHED match', () => {
    render(<MatchCard match={finishedMatch} />)
    expect(screen.getByText('FT')).toBeInTheDocument()
    expect(screen.queryByText("67'")).not.toBeInTheDocument()
  })
})
