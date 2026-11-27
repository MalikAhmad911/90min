import { ageOn, displayClubName, groupByPosition, positionGroup } from '@/components/player/player-utils'
import {
  decodePhotoUrl,
  encodePhotoUrl,
  parseHeightCm,
  parseShirtNumber,
  photoCredit,
} from '@/lib/providers/thesportsdb-players'
import { matchCandidate, type WikidataCandidate } from '@/lib/providers/wikidata'
import { LEAGUE_ZONES, ZONE_MARKERS, zoneFor, zonesInTable } from '@/lib/league-zones'
import { FREE_COMPETITION_CODES } from '@/lib/competitions'
import { playerIdSchema, squadQuerySchema } from '@/lib/db/player-queries'
import { fixturesQuerySchema, leaderQueryOrDefault, leagueCodeSchema } from '@/lib/db/league-queries'
import { enrichOptionsSchema, parseSquadResource } from '@/lib/server/sync/players'

describe('parseHeightCm', () => {
  it.each([
    ['1.95 m (6 ft 5 in)', 195],
    ['178 cm', 178],
    ['189cm / 6\'2"', 189],
    ['6 ft 2 in', 188],
  ])('%s -> %i', (raw, cm) => {
    expect(parseHeightCm(raw)).toBe(cm)
  })

  it('rejects empty, unparseable and out-of-range values', () => {
    expect(parseHeightCm(null)).toBeNull()
    expect(parseHeightCm('tall')).toBeNull()
    expect(parseHeightCm('2.95 m')).toBeNull()
  })

  it('parses shirt numbers 0-99 only', () => {
    expect(parseShirtNumber('9')).toBe(9)
    expect(parseShirtNumber('100')).toBeNull()
    expect(parseShirtNumber(null)).toBeNull()
  })
})

describe('ageOn', () => {
  it('counts whole years around the birthday', () => {
    expect(ageOn('2000-07-21', new Date('2026-07-20T12:00:00Z'))).toBe(25)
    expect(ageOn('2000-07-21', new Date('2026-07-21T00:00:00Z'))).toBe(26)
  })

  it('returns null for missing or malformed dates', () => {
    expect(ageOn(null)).toBeNull()
    expect(ageOn('21/07/2000')).toBeNull()
    expect(ageOn('2000-13-01')).toBeNull()
  })
})

describe('Wikidata name + DOB matching', () => {
  const c = (qid: string, label: string, dob: string, heightCm: number | null = null): WikidataCandidate => ({
    qid,
    label,
    dateOfBirth: dob,
    heightCm,
  })
  const salahs = [
    c('Q50365713', 'Mohamed Salah', '1994-11-07'),
    c('Q1354960', 'Mohamed Salah', '1992-06-15', 175),
  ]

  it('picks the namesake with the same date of birth', () => {
    expect(matchCandidate({ name: 'Mohamed Salah', dateOfBirth: '1992-06-15' }, salahs)?.qid).toBe('Q1354960')
  })

  it('ignores accents and case', () => {
    expect(
      matchCandidate({ name: 'Mesut Özil', dateOfBirth: '1988-10-15' }, [c('Q3', 'mesut ozil', '1988-10-15')])?.qid
    ).toBe('Q3')
  })

  it('refuses without a DOB, on a DOB mismatch, or when ambiguous', () => {
    expect(matchCandidate({ name: 'Mohamed Salah', dateOfBirth: null }, salahs)).toBeNull()
    expect(matchCandidate({ name: 'Mohamed Salah', dateOfBirth: '2001-01-01' }, salahs)).toBeNull()
    expect(
      matchCandidate({ name: 'Rodrigo', dateOfBirth: '1991-03-06' }, [
        c('Q10', 'Rodrigo', '1991-03-06'),
        c('Q11', 'Rodrigo', '1991-03-06'),
      ])
    ).toBeNull()
  })
})

describe('photo licence', () => {
  it('allows a photo only when flagged Creative Commons with a credit', () => {
    expect(photoCredit({ strCreativeCommons: 'Yes', strCreativeCommonsAttribution: 'By X, CC BY-SA 4.0' })).toBe(
      'By X, CC BY-SA 4.0'
    )
    expect(photoCredit({ strCreativeCommons: 'No', strCreativeCommonsAttribution: 'By X' })).toBeNull()
    expect(photoCredit({ strCreativeCommons: 'Yes', strCreativeCommonsAttribution: '' })).toBeNull()
  })

  it('round-trips the credit and treats a URL without one as no photo', () => {
    const stored = encodePhotoUrl('https://r2.thesportsdb.com/a.jpg', 'By Jane #1, CC BY-SA 4.0')
    expect(decodePhotoUrl(stored)).toEqual({ src: 'https://r2.thesportsdb.com/a.jpg', credit: 'By Jane #1, CC BY-SA 4.0' })
    expect(decodePhotoUrl('https://r2.thesportsdb.com/a.jpg')).toBeNull()
  })
})

describe('position grouping', () => {
  it('maps coarse and detailed positions', () => {
    expect(positionGroup('Goalkeeper')).toBe('Goalkeeper')
    expect(positionGroup('Centre-Back')).toBe('Defence')
    expect(positionGroup('Defensive Midfield')).toBe('Midfield')
    expect(positionGroup('Centre-Forward')).toBe('Offence')
    expect(positionGroup(null)).toBe('Unknown')
  })

  it('orders groups GK, DEF, MID, OFF and drops empty ones', () => {
    const groups = groupByPosition([
      { id: 1, position: 'Offence' },
      { id: 2, position: 'Goalkeeper' },
      { id: 3, position: 'Defence' },
    ])
    expect(groups.map((g) => g.group)).toEqual(['Goalkeeper', 'Defence', 'Offence'])
  })

  it('strips only a trailing club suffix', () => {
    expect(displayClubName('Manchester City FC')).toBe('Manchester City')
    expect(displayClubName('AFC Bournemouth')).toBe('AFC Bournemouth')
  })
})

describe('league zones', () => {
  it('maps Premier League positions, counting relegation from the bottom', () => {
    expect(zoneFor('PL', 1, 20)?.label).toBe('Champions League')
    expect(zoneFor('PL', 5, 20)?.tone).toBe('uel')
    expect(zoneFor('PL', 10, 20)).toBeNull()
    expect(zoneFor('PL', 18, 20)?.tone).toBe('relegation')
    expect(zoneFor('BL1', 16, 18)?.tone).toBe('relegation-playoff')
    expect(zoneFor('XX', 1, 20)).toBeNull()
  })

  it('lists only zones that fit the table, in order', () => {
    expect(zonesInTable('PL', 20).map((z) => z.tone)).toEqual(['ucl', 'uel', 'uecl', 'relegation'])
    expect(zonesInTable('CL', 8).map((z) => z.tone)).toEqual(['advance'])
  })

  it('covers every free competition with a marker per tone', () => {
    for (const code of FREE_COMPETITION_CODES) {
      expect(LEAGUE_ZONES[code]).toBeDefined()
      for (const r of LEAGUE_ZONES[code]) expect(ZONE_MARKERS[r.tone]).toBeTruthy()
    }
  })
})

describe('input schemas', () => {
  it('validates player and team ids', () => {
    expect(playerIdSchema.parse('38101')).toBe(38101)
    for (const bad of ['0', '-1', '01', '1e3', 'abc', '']) expect(playerIdSchema.safeParse(bad).success).toBe(false)
    expect(squadQuerySchema.parse({ team: '65' })).toEqual({ team: 65 })
    expect(squadQuerySchema.safeParse({ team: '65;drop' }).success).toBe(false)
  })

  it('validates competition codes and matchdays', () => {
    expect(leagueCodeSchema.parse('pl')).toBe('PL')
    expect(leagueCodeSchema.safeParse('EL').success).toBe(false)
    expect(fixturesQuerySchema.parse({ matchday: '12' })).toEqual({ matchday: 12 })
    for (const bad of ['0', '61', '1.5', 'x']) expect(fixturesQuerySchema.safeParse({ matchday: bad }).success).toBe(false)
    expect(leaderQueryOrDefault(null)).toEqual({ limit: 10 })
    expect(leaderQueryOrDefault('51')).toBeNull()
  })

  it('bounds sync inputs', () => {
    expect(enrichOptionsSchema.parse({})).toEqual({ limit: 10 })
    expect(enrichOptionsSchema.safeParse({ limit: 26 }).success).toBe(false)
    expect(parseSquadResource('squad:65')).toBe(65)
    expect(parseSquadResource('season:PL')).toBeNull()
  })
})
