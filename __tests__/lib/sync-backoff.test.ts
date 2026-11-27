import { isBackingOff } from '@/lib/server/ingest'

describe('isBackingOff', () => {
  const now = Date.parse('2026-11-27T20:00:00Z')
  const ago = (ms: number) => new Date(now - ms)

  it('never holds back a resource that has not failed', () => {
    expect(isBackingOff(0, ago(1000), now)).toBe(false)
    expect(isBackingOff(3, null, now)).toBe(false)
  })

  it('waits a minute after the first failure', () => {
    expect(isBackingOff(1, ago(30_000), now)).toBe(true)
    expect(isBackingOff(1, ago(61_000), now)).toBe(false)
  })

  it('doubles the wait with each failure', () => {
    expect(isBackingOff(4, ago(7 * 60_000), now)).toBe(true)
    expect(isBackingOff(4, ago(9 * 60_000), now)).toBe(false)
  })

  it('caps the wait at six hours however many failures there were', () => {
    expect(isBackingOff(190, ago(5 * 60 * 60_000), now)).toBe(true)
    expect(isBackingOff(190, ago(6 * 60 * 60_000 + 1000), now)).toBe(false)
  })
})

import { resourcePriority } from '@/lib/server/ingest'

describe('resourcePriority', () => {
  it('puts scores ahead of enrichment', () => {
    const order = ['squad:57', 'players:enrich', 'scorers:PL', 'standings:PL', 'season:PL', 'live-window']
    expect([...order].sort((a, b) => resourcePriority(a) - resourcePriority(b))).toEqual([
      'live-window', 'season:PL', 'standings:PL', 'scorers:PL', 'squad:57', 'players:enrich',
    ])
  })
})
