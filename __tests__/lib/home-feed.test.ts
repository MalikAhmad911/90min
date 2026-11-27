import { buildFeed, filterMatches, followIndexFrom, orderFeed, EMPTY_FOLLOWS } from '@/lib/home-order'
import { localDayPlan } from '@/lib/db/home-queries'
import { followInputSchema, unfollowInputSchema, deviceIdFrom } from '@/app/api/follows/schema'
import { relativeDayLabel } from '@/lib/utils'
import { buildStripDates } from '@/components/home/DateStrip'
import type { Match, MatchStatus } from '@/lib/types'

const COMP: Record<string, { id: number; name: string }> = {
  PL: { id: 2021, name: 'Premier League' },
  PD: { id: 2014, name: 'La Liga' },
  WC: { id: 2000, name: 'FIFA World Cup' },
  EC: { id: 2018, name: 'European Championship' },
  BSA: { id: 2013, name: 'Brasileirao' },
  XYZ: { id: 9999, name: 'Unknown Cup' },
}

let nextId = 1
function m(code: string, utcDate: string, home = 1, away = 2, status: MatchStatus = 'SCHEDULED'): Match {
  const team = (id: number) => ({ id, name: `T${id}`, shortName: `T${id}`, tla: '', crest: '' })
  return {
    id: nextId++,
    status,
    utcDate,
    homeTeam: team(home),
    awayTeam: team(away),
    score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    competition: { id: COMP[code].id, name: COMP[code].name, code, emblem: '' },
  }
}

describe('orderFeed (MAT-2)', () => {
  it('pins followed teams, then followed leagues, then curated, then the rest', () => {
    const matches = [
      m('XYZ', '2026-11-20T12:00:00Z', 30, 31),
      m('EC', '2026-11-20T12:00:00Z', 20, 21),
      m('PD', '2026-11-20T15:00:00Z', 10, 11),
      m('PL', '2026-11-20T14:00:00Z', 57, 61),
      m('WC', '2026-11-20T18:00:00Z', 40, 41),
    ]
    const follows = followIndexFrom([
      { entityType: 'team', entityKey: '57' },
      { entityType: 'competition', entityKey: 'BSA' },
      { entityType: 'competition', entityKey: 'EC' },
    ])
    const feed = orderFeed(matches, follows)
    expect(feed.following.map((x) => x.homeTeam.id)).toEqual([57])
    // EC is followed so it jumps the curated list; PL keeps its curated slot.
    expect(feed.groups.map((g) => g.code)).toEqual(['EC', 'WC', 'PL', 'PD', 'XYZ'])
  })

  it('sorts non-curated competitions A-Z by country', () => {
    COMP.AAA = { id: 1, name: 'Zeta League' }
    COMP.BBB = { id: 2, name: 'Alpha League' }
    const feed = orderFeed([m('AAA', '2026-11-20T10:00:00Z'), m('BBB', '2026-11-20T10:00:00Z')], EMPTY_FOLLOWS)
    // No country known: falls back to the name, so Alpha precedes Zeta.
    expect(feed.groups.map((g) => g.code)).toEqual(['BBB', 'AAA'])
  })
})

describe('filters (MAT-3)', () => {
  const live = m('PL', '2026-11-20T14:00:00Z', 1, 2, 'IN_PLAY')
  const later = m('PD', '2026-11-20T20:00:00Z', 3, 4)
  const early = m('WC', '2026-11-20T09:00:00Z', 57, 5)

  it('Live keeps only in-play and paused matches', () => {
    expect(filterMatches([live, later], { mode: 'live', hidden: new Set() })).toEqual([live])
  })

  it('By time returns one chronological list across leagues', () => {
    const feed = buildFeed([later, live, early], EMPTY_FOLLOWS, { mode: 'time', hidden: new Set() })
    expect(feed.layout).toBe('flat')
    if (feed.layout === 'flat') expect(feed.matches.map((x) => x.id)).toEqual([early.id, live.id, later.id])
  })

  it('hidden competitions disappear, but a followed team survives in Following only', () => {
    const follows = followIndexFrom([{ entityType: 'team', entityKey: '57' }])
    const feed = buildFeed([early, later], follows, { mode: 'all', hidden: new Set(['WC', 'PD']) })
    expect(feed.layout).toBe('grouped')
    if (feed.layout === 'grouped') {
      expect(feed.following.map((x) => x.id)).toEqual([early.id])
      expect(feed.groups).toEqual([])
    }
  })
})

describe('localDayPlan (MAT-1)', () => {
  it('Karachi day spans two UTC dates and starts at 19:00Z the day before', () => {
    const plan = localDayPlan('2026-11-20', 'Asia/Karachi')
    expect(plan.start.toISOString()).toBe('2026-11-19T19:00:00.000Z')
    expect(plan.end.toISOString()).toBe('2026-11-20T19:00:00.000Z')
    expect(plan.utcDates).toEqual(['2026-11-19', '2026-11-20'])
  })

  it('UTC day is exactly one UTC date (backward compatible)', () => {
    expect(localDayPlan('2026-11-20', 'UTC').utcDates).toEqual(['2026-11-20'])
  })

  it('west of UTC reaches into the next UTC date', () => {
    expect(localDayPlan('2026-11-20', 'America/New_York').utcDates).toEqual(['2026-11-20', '2026-11-21'])
  })

  it('handles a DST day (London spring-forward is 23 hours)', () => {
    const plan = localDayPlan('2026-03-29', 'Europe/London')
    expect(plan.end.getTime() - plan.start.getTime()).toBe(23 * 3600_000)
  })

  it('never leaves date-1..date+1 even at the extremes', () => {
    for (const tz of ['Pacific/Kiritimati', 'Etc/GMT+12']) {
      for (const d of localDayPlan('2026-11-20', tz).utcDates) {
        expect(['2026-11-19', '2026-11-20', '2026-11-21']).toContain(d)
      }
    }
  })
})

describe('follows schema', () => {
  it('accepts valid follows', () => {
    expect(followInputSchema.safeParse({ entityType: 'team', entityKey: '57' }).success).toBe(true)
    expect(followInputSchema.safeParse({ entityType: 'competition', entityKey: 'PL', notify: { goals: true } }).success).toBe(true)
    expect(unfollowInputSchema.safeParse({ entityType: 'match', entityKey: '555089' }).success).toBe(true)
  })

  it('rejects unknown entity types, bad keys and extra fields', () => {
    const bad = [
      { entityType: 'user', entityKey: '1' },
      { entityType: 'team', entityKey: 'PL' },
      { entityType: 'team', entityKey: '057' },
      { entityType: 'team', entityKey: '-1' },
      { entityType: 'team', entityKey: 57 },
      { entityType: 'team', entityKey: '99999999999' },
      { entityType: 'competition', entityKey: 'XYZ' },
      { entityType: 'competition', entityKey: 'pl' },
      { entityType: 'team', entityKey: '57', deviceId: 'x' },
    ]
    for (const body of bad) expect(followInputSchema.safeParse(body).success).toBe(false)
  })

  it('rejects unknown notify keys and non-boolean values', () => {
    expect(followInputSchema.safeParse({ entityType: 'team', entityKey: '57', notify: { spam: true } }).success).toBe(false)
    expect(followInputSchema.safeParse({ entityType: 'team', entityKey: '57', notify: { goals: 'yes' } }).success).toBe(false)
  })

  it('only accepts well-formed device ids', () => {
    const h = (v?: string) => new Headers(v === undefined ? {} : { 'x-device-id': v })
    expect(deviceIdFrom(h('0123456789abcdef0123456789abcdef'))).toBe('0123456789abcdef0123456789abcdef')
    expect(deviceIdFrom(h())).toBeNull()
    expect(deviceIdFrom(h('short'))).toBeNull()
    expect(deviceIdFrom(h('x'.repeat(65)))).toBeNull()
    expect(deviceIdFrom(h("abc'; drop table follows;--xx"))).toBeNull()
  })
})

describe('date labels (MAT-6)', () => {
  it('labels relative to the local today', () => {
    expect(relativeDayLabel('2026-11-28', '2026-11-28')).toBe('Today')
    expect(relativeDayLabel('2026-11-27', '2026-11-28')).toBe('Yesterday')
    expect(relativeDayLabel('2026-11-29', '2026-11-28')).toBe('Tomorrow')
    expect(relativeDayLabel('2026-11-21', '2026-11-28')).toBe('Sat 21 Nov')
  })

  it('builds a ±7 day strip centred on today', () => {
    const strip = buildStripDates('2026-11-28')
    expect(strip).toHaveLength(15)
    expect(strip[0].date).toBe('2026-11-21')
    expect(strip[7]).toEqual({ date: '2026-11-28', label: 'Today' })
    expect(strip[14].date).toBe('2026-12-05')
  })
})
