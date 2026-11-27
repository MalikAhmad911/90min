import {
  buildCompetitionMetadata,
  buildMatchMetadata,
  buildTeamMetadata,
  notFoundMetadata,
} from '@/lib/seo/metadata'
import { describeMatch } from '@/lib/seo/describe'
import { getSiteUrl, absoluteUrl } from '@/lib/seo/site'
import { parseEntityId } from '@/lib/seo/ids'
import { resolveCompetition } from '@/lib/competitions'
import { makeMatch, makeTable } from './seo-fixtures'

describe('buildMatchMetadata', () => {
  it('titles a match "Home vs Away – Competition | site"', () => {
    const meta = buildMatchMetadata(makeMatch())
    expect(meta.title).toBe('Arsenal vs Chelsea – Premier League | 90 Min Tactics')
    expect(meta.alternates?.canonical).toBe('/match/537785')
    expect(meta.openGraph).toMatchObject({ url: '/match/537785', siteName: '90 Min Tactics' })
    expect(meta.twitter).toMatchObject({ card: 'summary' })
  })

  it('describes a fixture with its UTC kick-off', () => {
    expect(buildMatchMetadata(makeMatch()).description).toBe(
      'Arsenal vs Chelsea, Premier League. Kick-off Sat 28 Nov 2026, 15:00 UTC. Live score, lineups, stats and head-to-head.'
    )
  })

  it('describes a result with the score', () => {
    const match = makeMatch({
      status: 'FINISHED',
      score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
    })
    expect(describeMatch(match)).toBe(
      'Full time: Arsenal 2-1 Chelsea. Premier League, Sat 28 Nov 2026. Goals, lineups, stats and head-to-head.'
    )
  })

  it('describes a live match with the minute', () => {
    const match = makeMatch({
      status: 'IN_PLAY',
      minute: 67,
      score: { fullTime: { home: 1, away: 0 }, halfTime: { home: 1, away: 0 } },
    })
    expect(describeMatch(match)).toMatch(/^Live: Arsenal 1-0 Chelsea \(67'\)\./)
  })

  it('describes postponed and cancelled matches', () => {
    expect(describeMatch(makeMatch({ status: 'POSTPONED' }))).toContain('has been postponed')
    expect(describeMatch(makeMatch({ status: 'CANCELLED' }))).toContain('has been cancelled')
  })
})

describe('buildTeamMetadata', () => {
  it('names the team and summarises last result and next fixture', () => {
    const now = Date.parse('2026-11-20T00:00:00Z')
    const past = makeMatch({
      id: 1,
      utcDate: '2026-11-10T15:00:00.000Z',
      status: 'FINISHED',
      score: { fullTime: { home: 3, away: 0 }, halfTime: { home: 1, away: 0 } },
    })
    const next = makeMatch({ id: 2 })
    const meta = buildTeamMetadata({ id: 57, name: 'Arsenal FC', shortName: 'Arsenal' }, [past, next], now)

    expect(meta.title).toBe('Arsenal FC – Fixtures, Results & Squad | 90 Min Tactics')
    expect(meta.alternates?.canonical).toBe('/team/57')
    expect(meta.description).toContain('Last result: Arsenal 3-0 Chelsea.')
    expect(meta.description).toContain('Next: Arsenal vs Chelsea, Sat 28 Nov 2026, 15:00 UTC.')
  })

  it('still has a description with no matches', () => {
    const meta = buildTeamMetadata({ id: 1, name: 'Club FC', shortName: 'Club' }, [])
    expect(meta.description).toBe('Club FC fixtures, results and live scores. Follow Club on 90 Min Tactics.')
  })
})

describe('buildCompetitionMetadata', () => {
  it('uses the competition code in the canonical, whatever the route segment was', () => {
    const pl = resolveCompetition('2021')!
    const meta = buildCompetitionMetadata(pl, makeTable())
    expect(meta.title).toBe('Premier League – Table, Fixtures & Top Scorers | 90 Min Tactics')
    expect(meta.alternates?.canonical).toBe('/leagues/PL')
    expect(meta.description).toContain('Arsenal lead on 30 points after 12 games.')
  })

  it('does not name a leader without a table', () => {
    const meta = buildCompetitionMetadata(resolveCompetition('CL')!, [])
    expect(meta.description).toBe('UEFA Champions League (Europe) table, fixtures, results and top scorers.')
  })
})

describe('notFoundMetadata', () => {
  it('keeps missing entities out of the index', () => {
    expect(notFoundMetadata('Match')).toEqual({
      title: 'Match not found | 90 Min Tactics',
      robots: { index: false, follow: true },
    })
  })
})

describe('parseEntityId', () => {
  it('accepts positive integer ids only', () => {
    expect(parseEntityId('57')).toBe(57)
    expect(parseEntityId('0')).toBeNull()
    expect(parseEntityId('-1')).toBeNull()
    expect(parseEntityId('1.5')).toBeNull()
    expect(parseEntityId('1e3')).toBeNull()
    expect(parseEntityId('57abc')).toBeNull()
    expect(parseEntityId('')).toBeNull()
    // Larger than Postgres integer: would error in the query, so it is a 404 instead.
    expect(parseEntityId('2147483648')).toBeNull()
  })
})

describe('getSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL, then Netlify URL, then localhost', () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://90min.example/', URL: 'https://x.netlify.app' })).toBe(
      'https://90min.example'
    )
    expect(getSiteUrl({ URL: 'https://x.netlify.app' })).toBe('https://x.netlify.app')
    expect(getSiteUrl({})).toBe('http://localhost:3000')
  })

  it('skips values that are not absolute http(s) URLs', () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: 'javascript:alert(1)', URL: 'https://x.netlify.app' })).toBe(
      'https://x.netlify.app'
    )
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: 'not a url' })).toBe('http://localhost:3000')
  })

  it('joins paths without doubling slashes', () => {
    expect(absoluteUrl('/match/1', { NEXT_PUBLIC_SITE_URL: 'https://90min.example/' })).toBe(
      'https://90min.example/match/1'
    )
  })
})
