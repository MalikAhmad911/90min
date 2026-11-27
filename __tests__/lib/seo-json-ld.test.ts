import {
  competitionJsonLd,
  eventStatusFor,
  matchJsonLd,
  serializeJsonLd,
  teamJsonLd,
} from '@/lib/seo/json-ld'
import { resolveCompetition } from '@/lib/competitions'
import { makeMatch, makeTable } from './seo-fixtures'

describe('serializeJsonLd', () => {
  it('cannot be closed early by a value containing </script>', () => {
    const hostile = { name: '</script><script>alert(1)</script>' }
    const out = serializeJsonLd(hostile)

    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out.toLowerCase()).not.toContain('</script')
    // Still the same data to a JSON parser.
    expect(JSON.parse(out)).toEqual(hostile)
  })

  it('escapes an HTML comment opener and ampersands', () => {
    const out = serializeJsonLd({ a: '<!-- x & y -->' })
    expect(out).not.toMatch(/[<>&]/)
    expect(JSON.parse(out)).toEqual({ a: '<!-- x & y -->' })
  })

  it('escapes the U+2028 / U+2029 line separators', () => {
    const value = `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`
    const out = serializeJsonLd({ value })
    expect(out).toContain('\\u2028')
    expect(out).toContain('\\u2029')
    expect(JSON.parse(out)).toEqual({ value })
  })

  it('escapes hostile values inside a built match object too', () => {
    const match = makeMatch({
      homeTeam: { id: 1, name: '</script><img src=x onerror=alert(1)>', shortName: '', tla: '', crest: '' },
    })
    const out = serializeJsonLd(matchJsonLd(match))
    expect(out).not.toContain('<')
    expect(JSON.parse(out).homeTeam.name).toBe('</script><img src=x onerror=alert(1)>')
  })
})

describe('matchJsonLd', () => {
  it('builds a SportsEvent with both teams and the kick-off', () => {
    const ld = matchJsonLd(makeMatch())
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('SportsEvent')
    expect(ld.name).toBe('Arsenal vs Chelsea – Premier League')
    expect(ld.startDate).toBe('2026-11-28T15:00:00.000Z')
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled')
    expect(ld.homeTeam).toMatchObject({ '@type': 'SportsTeam', name: 'Arsenal FC', url: expect.stringMatching(/\/team\/57$/) })
    expect(ld.awayTeam).toMatchObject({ '@type': 'SportsTeam', name: 'Chelsea FC' })
    expect(ld.url).toMatch(/\/match\/537785$/)
  })

  it('omits location when there is no venue', () => {
    expect(matchJsonLd(makeMatch())).not.toHaveProperty('location')
    expect(matchJsonLd(makeMatch(), { venue: '   ' })).not.toHaveProperty('location')
  })

  it('includes location as a Place when a venue exists', () => {
    expect(matchJsonLd(makeMatch(), { venue: 'Emirates Stadium' }).location).toEqual({
      '@type': 'Place',
      name: 'Emirates Stadium',
    })
  })

  it('drops crest URLs that are not http(s)', () => {
    const match = makeMatch({
      homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'javascript:alert(1)' },
    })
    const ld = matchJsonLd(match)
    expect(ld.homeTeam).not.toHaveProperty('logo')
    expect(ld.image).toEqual(['https://crests.football-data.org/61.png'])
  })
})

describe('eventStatusFor', () => {
  it('maps provider statuses onto schema.org event statuses', () => {
    expect(eventStatusFor('FINISHED')).toBe('https://schema.org/EventScheduled')
    expect(eventStatusFor('IN_PLAY')).toBe('https://schema.org/EventScheduled')
    expect(eventStatusFor('POSTPONED')).toBe('https://schema.org/EventPostponed')
    expect(eventStatusFor('CANCELLED')).toBe('https://schema.org/EventCancelled')
  })
})

describe('teamJsonLd', () => {
  it('builds a SportsTeam with alternate names and its competitions', () => {
    const ld = teamJsonLd(
      { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: 'https://crests.football-data.org/57.png' },
      [makeMatch(), makeMatch({ id: 2 })]
    )
    expect(ld['@type']).toBe('SportsTeam')
    expect(ld.name).toBe('Arsenal FC')
    expect(ld.alternateName).toEqual(['Arsenal', 'ARS'])
    expect(ld.logo).toBe('https://crests.football-data.org/57.png')
    expect(ld.memberOf).toEqual([
      { '@type': 'SportsOrganization', name: 'Premier League', url: expect.stringMatching(/\/leagues\/PL$/) },
    ])
  })

  it('leaves out empty optional fields', () => {
    const ld = teamJsonLd({ id: 1, name: 'Club', shortName: null, tla: null, crest: null })
    expect(ld).not.toHaveProperty('alternateName')
    expect(ld).not.toHaveProperty('logo')
    expect(ld).not.toHaveProperty('memberOf')
  })
})

describe('competitionJsonLd', () => {
  it('builds a SportsOrganization with the table teams as members', () => {
    const pl = resolveCompetition('PL')!
    const ld = competitionJsonLd(pl, makeTable())
    expect(ld['@type']).toBe('SportsOrganization')
    expect(ld.name).toBe('Premier League')
    expect(ld.url).toMatch(/\/leagues\/PL$/)
    expect(ld.member).toHaveLength(2)
    expect(ld.description).toContain('Arsenal lead on 30 points')
  })
})
