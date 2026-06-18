import { describe, it, expect } from 'vitest'
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

describe('MatchCard', () => {
  it('renders both team names', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText('Liverpool')).toBeInTheDocument()
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it('renders score for live match', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders LiveBadge for in-play match', () => {
    render(<MatchCard match={liveMatch} />)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })
})
