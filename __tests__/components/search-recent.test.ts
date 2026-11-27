import {
  clearRecentSearches,
  mergeRecentSearch,
  parseRecentSearches,
  readRecentSearches,
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_MAX,
  saveRecentSearch,
  type RecentSearch,
} from '@/components/search/recent-searches'

const entry = (n: number): RecentSearch => ({ type: 'team', label: `Team ${n}`, href: `/team/${n}` })

describe('parseRecentSearches', () => {
  it('returns [] for missing, malformed or non-array data', () => {
    expect(parseRecentSearches(null)).toEqual([])
    expect(parseRecentSearches('{not json')).toEqual([])
    expect(parseRecentSearches('{"a":1}')).toEqual([])
  })

  it('drops entries whose href is not a same-origin path', () => {
    const raw = JSON.stringify([
      { type: 'team', label: 'ok', href: '/team/1' },
      { type: 'team', label: 'xss', href: 'javascript:alert(1)' },
      { type: 'team', label: 'offsite', href: '//evil.example/x' },
      { type: 'team', label: 'offsite2', href: 'https://evil.example/x' },
      { type: 'team', label: 'backslash', href: '/\\evil.example' },
    ])
    expect(parseRecentSearches(raw).map((r) => r.label)).toEqual(['ok'])
  })

  it('drops entries with a non-http image or an unknown type', () => {
    const raw = JSON.stringify([
      { type: 'team', label: 'bad image', href: '/team/1', image: 'javascript:alert(1)' },
      { type: 'admin', label: 'bad type', href: '/team/2' },
      { type: 'team', label: 'good', href: '/team/3', image: 'https://crests.football-data.org/3.png' },
    ])
    expect(parseRecentSearches(raw).map((r) => r.label)).toEqual(['good'])
  })

  it('caps the list', () => {
    const raw = JSON.stringify(Array.from({ length: 20 }, (_, i) => entry(i)))
    expect(parseRecentSearches(raw)).toHaveLength(RECENT_SEARCHES_MAX)
  })
})

describe('mergeRecentSearch', () => {
  it('puts the newest first and removes the older duplicate', () => {
    const merged = mergeRecentSearch([entry(1), entry(2), entry(3)], entry(2))
    expect(merged.map((r) => r.href)).toEqual(['/team/2', '/team/1', '/team/3'])
  })

  it('caps at the maximum', () => {
    const list = Array.from({ length: RECENT_SEARCHES_MAX }, (_, i) => entry(i))
    expect(mergeRecentSearch(list, entry(99))).toHaveLength(RECENT_SEARCHES_MAX)
  })
})

describe('storage access', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('round-trips through localStorage', () => {
    saveRecentSearch(entry(1))
    saveRecentSearch(entry(2))
    expect(readRecentSearches().map((r) => r.href)).toEqual(['/team/2', '/team/1'])
    clearRecentSearches()
    expect(readRecentSearches()).toEqual([])
    expect(window.localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull()
  })

  it('refuses to store an invalid entry', () => {
    saveRecentSearch({ type: 'team', label: 'x', href: 'javascript:alert(1)' })
    expect(readRecentSearches()).toEqual([])
  })

  it('never throws when storage itself throws (privacy mode, full quota)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readRecentSearches()).toEqual([])
    expect(() => saveRecentSearch(entry(1))).not.toThrow()
    expect(saveRecentSearch(entry(1))).toEqual([entry(1)])
    expect(() => clearRecentSearches()).not.toThrow()
  })
})
