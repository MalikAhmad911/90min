import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { MatchDetailView } from '@/components/match/MatchDetailView'
import { TeamView } from '@/components/team/TeamView'
import { makeMatch } from '../lib/seo-fixtures'

/**
 * The server-rendered pages hand their database read to the client views as
 * SWR fallback data. These tests pin the two things that makes possible:
 * real content on the first render (no skeleton), and a server render that
 * does not depend on the server's timezone.
 */

const match = makeMatch()
const team = { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: '' }

// A fresh SWR cache per render, so one test's data cannot leak into another.
function withFreshCache(node: React.ReactNode) {
  return <SWRConfig value={{ provider: () => new Map() }}>{node}</SWRConfig>
}

beforeEach(() => {
  // The mount-time revalidation never resolves: the view must not wait for it.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MatchDetailView with initial data', () => {
  it('renders both teams immediately instead of a loading skeleton', () => {
    render(withFreshCache(<MatchDetailView id="537785" initialData={{ match, headToHead: [] }} />))
    expect(screen.getByText('Arsenal')).toBeInTheDocument()
    expect(screen.getByText('Chelsea')).toBeInTheDocument()
    expect(screen.queryByText('Could not load this match')).not.toBeInTheDocument()
  })

  it('server-renders the kick-off in UTC so hydration cannot mismatch', () => {
    const html = renderToString(
      withFreshCache(<MatchDetailView id="537785" initialData={{ match, headToHead: [] }} />)
    )
    expect(html).toContain('Arsenal')
    expect(html).toContain('15:00')
  })

  it('still shows the loading state without initial data', () => {
    const { container } = render(withFreshCache(<MatchDetailView id="537785" />))
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})

describe('TeamView with initial data', () => {
  it('renders the team name and its fixtures on the first render', () => {
    render(
      withFreshCache(
        <TeamView
          id="57"
          initialData={{ team, matches: [match] }}
          renderedAt={Date.parse('2026-11-20T00:00:00Z')}
        />
      )
    )
    expect(screen.getByRole('heading', { name: 'Arsenal FC' })).toBeInTheDocument()
    expect(screen.getByText('Chelsea')).toBeInTheDocument()
  })
})
