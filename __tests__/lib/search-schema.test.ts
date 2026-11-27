import {
  isSearchable,
  parseSearchQuery,
  SEARCH_MAX_LENGTH,
  searchPageHref,
} from '@/components/search/schema'

describe('parseSearchQuery', () => {
  it('accepts and trims a normal query', () => {
    expect(parseSearchQuery('  liverpool  ')).toEqual({ ok: true, q: 'liverpool' })
  })

  it('collapses internal whitespace', () => {
    expect(parseSearchQuery('man   city')).toEqual({ ok: true, q: 'man city' })
  })

  it('accepts real names with accents and punctuation', () => {
    for (const name of ['Bodø/Glimt', "M'gladbach", '1. FC Köln', 'Brighton & Hove Albion', 'Paris Saint-Germain', 'São Paulo']) {
      expect(parseSearchQuery(name)).toEqual({ ok: true, q: name })
    }
  })

  it('rejects queries shorter than 2 characters after trimming', () => {
    expect(parseSearchQuery('x').ok).toBe(false)
    expect(parseSearchQuery('  x  ').ok).toBe(false)
    expect(parseSearchQuery('').ok).toBe(false)
  })

  it('accepts exactly 64 characters and rejects 65', () => {
    expect(parseSearchQuery('a'.repeat(SEARCH_MAX_LENGTH)).ok).toBe(true)
    const tooLong = parseSearchQuery('a'.repeat(SEARCH_MAX_LENGTH + 1))
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.error).toMatch(/at most 64/)
  })

  it('measures length after trimming', () => {
    expect(parseSearchQuery(`  ${'a'.repeat(SEARCH_MAX_LENGTH)}  `).ok).toBe(true)
  })

  it('rejects characters outside the allow-list', () => {
    for (const bad of ['<script>', 'a%b', 'a_b', 'drop;', '"quoted"', 'a\u0000b', 'a*']) {
      expect(parseSearchQuery(bad).ok).toBe(false)
    }
  })

  it('rejects non-string input (missing or repeated parameter)', () => {
    expect(parseSearchQuery(null).ok).toBe(false)
    expect(parseSearchQuery(undefined).ok).toBe(false)
    expect(parseSearchQuery(['a', 'b']).ok).toBe(false)
    expect(parseSearchQuery(42).ok).toBe(false)
  })
})

describe('isSearchable / searchPageHref', () => {
  it('mirrors the schema', () => {
    expect(isSearchable('li')).toBe(true)
    expect(isSearchable('l')).toBe(false)
  })

  it('encodes the query into the results URL', () => {
    expect(searchPageHref('brighton & hove')).toBe('/search?q=brighton%20%26%20hove')
  })
})
