import { describe, it, expect } from 'vitest'
import { getWatchOptions, COUNTRIES } from '@/lib/tv/broadcasters'
import { getFreeStream } from '@/lib/tv/free-streams'
import type { Match } from '@/lib/types'
import type { StreamOverrides } from '@/lib/tv/types'

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 1,
  status: 'SCHEDULED',
  utcDate: '2026-06-21T15:00:00Z',
  homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: '' },
  awayTeam: { id: 2, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: '' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
  competition: { id: 2021, name: 'Premier League', code: 'PL', emblem: '' },
  ...overrides,
})

describe('getWatchOptions', () => {
  it('returns broadcasters for a known competition + country', () => {
    const opts = getWatchOptions('PL', 'GB')
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.every((b) => b.name && b.url && (b.kind === 'tv' || b.kind === 'stream'))).toBe(true)
  })

  it('returns different broadcasters per country', () => {
    const gb = getWatchOptions('PL', 'GB').map((b) => b.name)
    const us = getWatchOptions('PL', 'US').map((b) => b.name)
    expect(gb).not.toEqual(us)
  })

  it('returns empty array for unknown competition', () => {
    expect(getWatchOptions('ZZZ', 'GB')).toEqual([])
  })

  it('returns empty array for country with no data', () => {
    expect(getWatchOptions('ELC', 'PK')).toEqual([])
  })

  it('has broadcaster data for every supported country in PL', () => {
    for (const c of COUNTRIES) {
      expect(getWatchOptions('PL', c.code).length).toBeGreaterThan(0)
    }
  })
})

describe('getFreeStream', () => {
  it('returns null for a scheduled match with no curated stream', () => {
    expect(getFreeStream(makeMatch({ status: 'SCHEDULED' }))).toBeNull()
  })

  it('returns a playable stream for a live match (demo feed)', () => {
    const stream = getFreeStream(makeMatch({ status: 'IN_PLAY' }))
    expect(stream).not.toBeNull()
    expect(stream?.kind).toBe('hls')
    expect(stream?.src).toMatch(/\.m3u8$/)
  })

  it('returns a stream for a paused (half-time) match', () => {
    expect(getFreeStream(makeMatch({ status: 'PAUSED' }))).not.toBeNull()
  })

  it('returns null for a finished match', () => {
    expect(getFreeStream(makeMatch({ status: 'FINISHED' }))).toBeNull()
  })
})

describe('getFreeStream with admin overrides', () => {
  const overrides: StreamOverrides = {
    byMatch: { '1': { kind: 'youtube', src: 'matchVid', title: 'Match override' } },
    byCompetition: { PL: { kind: 'hls', src: 'https://x/comp.m3u8', title: 'Comp override' } },
  }

  it('per-match override wins over everything', () => {
    const s = getFreeStream(makeMatch({ id: 1, status: 'FINISHED' }), overrides)
    expect(s?.src).toBe('matchVid')
  })

  it('falls back to competition override when no match override', () => {
    const s = getFreeStream(makeMatch({ id: 999, status: 'SCHEDULED' }), overrides)
    expect(s?.src).toBe('https://x/comp.m3u8')
  })

  it('returns null when no override and not live', () => {
    const s = getFreeStream(makeMatch({ id: 999, status: 'SCHEDULED', competition: { id: 1, name: 'X', code: 'ZZZ', emblem: '' } }), overrides)
    expect(s).toBeNull()
  })
})
