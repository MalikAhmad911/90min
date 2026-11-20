import { render, screen } from '@testing-library/react'
import { WatchMatchRow } from '@/components/watch/WatchMatchRow'
import type { Match } from '@/lib/types'
import type { Country } from '@/lib/tv/types'

const GB: Country = { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' }

const baseMatch: Match = {
  id: 1,
  status: 'SCHEDULED',
  utcDate: '2026-06-21T15:00:00Z',
  homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: '' },
  awayTeam: { id: 2, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: '' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: '' },
}

describe('WatchMatchRow', () => {
  it('renders both team names', () => {
    render(<WatchMatchRow match={baseMatch} country={GB} />)
    expect(screen.getByText('Liverpool')).toBeInTheDocument()
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
  })

  it('shows broadcasters for the selected country', () => {
    render(<WatchMatchRow match={baseMatch} country={GB} />)
    expect(screen.getByText('Sky Sports')).toBeInTheDocument()
  })

  // Being live is not on its own a reason to offer playback - there has to be
  // a stream we are actually allowed to play.
  it('does not show a Watch button for a live match with no stream', () => {
    render(<WatchMatchRow match={{ ...baseMatch, status: 'IN_PLAY', minute: 30 }} country={GB} />)
    expect(screen.queryByText('Watch')).not.toBeInTheDocument()
  })

  it('shows a Watch button once an admin has added a stream for the match', () => {
    render(
      <WatchMatchRow
        match={{ ...baseMatch, status: 'IN_PLAY', minute: 30 }}
        country={GB}
        overrides={{
          byMatch: { '1': { kind: 'youtube', src: 'abc123', title: 'Official stream' } },
          byCompetition: {},
        }}
      />
    )
    expect(screen.getByText('Watch')).toBeInTheDocument()
  })

  it('does not show a Watch button for a scheduled match without a stream', () => {
    render(<WatchMatchRow match={baseMatch} country={GB} />)
    expect(screen.queryByText('Watch')).not.toBeInTheDocument()
  })
})
