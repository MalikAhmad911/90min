import { PgDialect } from 'drizzle-orm/pg-core'
import {
  buildSearchStatement,
  escapeLike,
  FOLD_FROM,
  FOLD_TO,
  foldText,
  matchToItem,
  MatchTier,
  matchTier,
  playerToItem,
  rankCandidates,
  teamPairSplits,
  teamToItem,
  competitionToItem,
  type MatchRow,
} from '@/lib/db/search-queries'

describe('foldText', () => {
  it('lower-cases, strips accents and collapses whitespace', () => {
    expect(foldText('  Club Atlético   de Madrid ')).toBe('club atletico de madrid')
    expect(foldText('FC Bayern München')).toBe('fc bayern munchen')
    expect(foldText('FK Bodø/Glimt')).toBe('fk bodo/glimt')
    expect(foldText('Fenerbahçe SK')).toBe('fenerbahce sk')
    expect(foldText('ŠK Slovan Bratislava')).toBe('sk slovan bratislava')
    expect(foldText('Barça')).toBe('barca')
  })

  it('normalises typographic apostrophes to the ASCII one', () => {
    expect(foldText('M’gladbach')).toBe("m'gladbach")
  })
})

describe('FOLD_FROM / FOLD_TO (fed to Postgres translate())', () => {
  it('have the same number of characters, so translate() maps one to one', () => {
    expect([...FOLD_FROM].length).toBe([...FOLD_TO].length)
  })

  it('agree with foldText character by character', () => {
    const from = [...FOLD_FROM]
    const to = [...FOLD_TO]
    from.forEach((ch, i) => expect(foldText(ch)).toBe(to[i]))
  })
})

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('100%_sure\\')).toBe('100\\%\\_sure\\\\')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeLike("m'gladbach 1. fc")).toBe("m'gladbach 1. fc")
  })
})

describe('matchTier', () => {
  const liverpool = { names: ['Liverpool FC', 'Liverpool'], codes: ['LIV'] }

  it('ranks an exact code match highest', () => {
    expect(matchTier('liv', liverpool)).toBe(MatchTier.Exact)
  })

  it('ranks an exact name match as exact', () => {
    expect(matchTier('liverpool', liverpool)).toBe(MatchTier.Exact)
  })

  it('recognises a prefix', () => {
    expect(matchTier('liverp', liverpool)).toBe(MatchTier.Prefix)
  })

  it('recognises a prefix of a later word', () => {
    expect(matchTier('city', { names: ['Manchester City FC', 'Man City'] })).toBe(MatchTier.WordPrefix)
    // Word boundaries include punctuation: "glimt" in "Bodø/Glimt".
    expect(matchTier('glimt', { names: ['FK Bodø/Glimt'] })).toBe(MatchTier.WordPrefix)
  })

  it('recognises a plain substring', () => {
    expect(matchTier('pool', liverpool)).toBe(MatchTier.Contains)
  })

  it('folds accents on the stored side', () => {
    expect(matchTier('atletico', { names: ['Club Atlético de Madrid', 'Atleti'] })).toBe(MatchTier.WordPrefix)
  })

  it('treats codes as exact-only, so "li" does not prefix-match "LIV" through the code', () => {
    expect(matchTier('li', { names: ['Lille OSC'], codes: ['LIV'] })).toBe(MatchTier.Prefix)
    expect(matchTier('iv', { names: ['Xyz'], codes: ['LIV'] })).toBe(MatchTier.None)
  })

  it('only gives context fields a weak match', () => {
    const pl = { names: ['Premier League'], codes: ['PL'], context: ['England'] }
    expect(matchTier('england', pl)).toBe(MatchTier.Weak)
    expect(matchTier('premier', pl)).toBe(MatchTier.Prefix)
  })

  it('returns None for an empty query or no match', () => {
    expect(matchTier('', liverpool)).toBe(MatchTier.None)
    expect(matchTier('arsenal', liverpool)).toBe(MatchTier.None)
  })

  it('treats regex metacharacters in the query literally', () => {
    expect(matchTier('1. fc', { names: ['1. FC Köln'] })).toBe(MatchTier.Prefix)
    expect(() => matchTier('(a', { names: ['x'] })).not.toThrow()
  })
})

describe('rankCandidates', () => {
  type Row = { name: string; short?: string; tla?: string; sim: number }
  const describeRow = (r: Row) => ({
    fields: { names: [r.name, r.short], codes: [r.tla] },
    sim: r.sim,
    label: r.name,
  })

  it('puts prefix hits above fuzzy hits with a higher similarity', () => {
    const rows: Row[] = [
      { name: 'Olivenza CF', sim: 0.9 }, // substring "liv", high similarity
      { name: 'Liverpool FC', short: 'Liverpool', sim: 0.2 },
    ]
    expect(rankCandidates('liver', rows, describeRow, 5).map((r) => r.name)).toEqual([
      'Liverpool FC',
      'Olivenza CF',
    ])
  })

  it('keeps fuzzy-only (typo) candidates, but below every literal match', () => {
    const rows: Row[] = [
      { name: 'Manchester City FC', short: 'Man City', sim: 0.32 },
      { name: 'Mansfield Town', sim: 0.1 },
    ]
    // "man citty" is a typo: neither row contains it, so similarity decides.
    expect(rankCandidates('man citty', rows, describeRow, 5)[0].name).toBe('Manchester City FC')
  })

  it('breaks ties on similarity, then shorter label, then alphabetically', () => {
    const rows: Row[] = [
      { name: 'Arsenal de Sarandí', sim: 0.4 },
      { name: 'Arsenal FC', sim: 0.4 },
      { name: 'Arsenal Tula', sim: 0.5 },
    ]
    expect(rankCandidates('arsenal', rows, describeRow, 5).map((r) => r.name)).toEqual([
      'Arsenal Tula',
      'Arsenal FC',
      'Arsenal de Sarandí',
    ])
  })

  it('honours the limit', () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ name: `Team ${i}`, sim: 0.5 }))
    expect(rankCandidates('team', rows, describeRow, 5)).toHaveLength(5)
  })

  it('tolerates a similarity that arrives as a string or NaN', () => {
    const rows = [
      { name: 'Liverpool FC', sim: '0.4' as unknown as number },
      { name: 'Liverpool Montevideo', sim: Number.NaN },
    ]
    expect(rankCandidates('liverpool', rows, describeRow, 5)).toHaveLength(2)
  })
})

describe('teamPairSplits', () => {
  it('returns nothing for a single word', () => {
    expect(teamPairSplits('arsenal')).toEqual([])
  })

  it('splits two names and drops "vs"-style connectors', () => {
    expect(teamPairSplits('arsenal chelsea')).toEqual([{ l: 'arsenal', r: 'chelsea' }])
    expect(teamPairSplits('arsenal vs chelsea')).toEqual([{ l: 'arsenal', r: 'chelsea' }])
    expect(teamPairSplits('arsenal v chelsea')).toEqual([{ l: 'arsenal', r: 'chelsea' }])
  })

  it('tries every cut of a multi-word query', () => {
    expect(teamPairSplits('man city liverpool')).toEqual([
      { l: 'man', r: 'city liverpool' },
      { l: 'man city', r: 'liverpool' },
    ])
  })

  it('skips cuts that leave a side too short to mean anything', () => {
    expect(teamPairSplits('liverpool fc')).toEqual([])
  })

  it('caps the number of words so the statement stays bounded', () => {
    expect(teamPairSplits('a1 b2 c3 d4 e5 f6 g7')).toEqual([])
  })
})

describe('row mappers', () => {
  it('maps a team with its league, and falls back when it has none', () => {
    const base = { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: 'https://x/64.png', sim: 1 }
    expect(teamToItem({ ...base, league: 'Premier League' })).toEqual({
      type: 'team',
      id: '64',
      label: 'Liverpool FC',
      sublabel: 'Premier League',
      image: 'https://x/64.png',
      href: '/team/64',
    })
    expect(teamToItem({ ...base, crest: '', league: null })).toMatchObject({ sublabel: 'Team', image: null })
  })

  it('maps a competition to its /leagues route', () => {
    expect(
      competitionToItem({ code: 'PL', name: 'Premier League', shortName: 'Premier League', country: 'England', emblem: null, sim: 1 })
    ).toMatchObject({ id: 'PL', href: '/leagues/PL', sublabel: 'England', image: null })
  })

  it('maps a player to /player/{id} with team and position', () => {
    expect(
      playerToItem({ id: 44, name: 'Mohamed Salah', position: 'Right Winger', photoUrl: null, teamName: 'Liverpool', sim: 1 })
    ).toMatchObject({ href: '/player/44', sublabel: 'Liverpool · Right Winger' })
    expect(
      playerToItem({ id: 45, name: 'Someone', position: null, photoUrl: null, teamName: null, sim: 1 })
    ).toMatchObject({ sublabel: 'Player' })
  })

  it('maps a match with a UTC date and the final score', () => {
    const row: MatchRow = {
      id: 560570,
      utcDate: '2026-09-06T23:30:00+00:00',
      status: 'FINISHED',
      homeScore: 2,
      awayScore: 1,
      homeName: 'Arsenal FC',
      homeShort: 'Arsenal',
      homeCrest: 'https://x/57.png',
      awayName: 'Chelsea FC',
      awayShort: 'Chelsea',
      awayCrest: 'https://x/61.png',
      competitionName: 'Premier League',
    }
    // 23:30 UTC stays on the 6th whatever the test machine's timezone.
    expect(matchToItem(row)).toEqual({
      type: 'match',
      id: '560570',
      label: 'Arsenal vs Chelsea',
      sublabel: 'Premier League · 6 Sept 2026 · FT 2–1',
      image: 'https://x/57.png',
      image2: 'https://x/61.png',
      label2: 'Chelsea',
      href: '/match/560570',
    })
    expect(matchToItem({ ...row, status: 'TIMED', homeScore: null, awayScore: null }).sublabel).toBe(
      'Premier League · 6 Sept 2026'
    )
  })
})

describe('buildSearchStatement', () => {
  const dialect = new PgDialect()

  it('never puts the user query in the SQL text - only in bind parameters', () => {
    const hostile = "zz'; drop table teams; --"
    const { sql, params } = dialect.sqlToQuery(buildSearchStatement(hostile, { limit: 5 }))
    expect(sql).not.toContain('drop table')
    expect(sql).not.toContain(hostile)
    expect(params).toContain(hostile)
  })

  it('passes the head-to-head pairs as one JSON parameter', () => {
    const { params } = dialect.sqlToQuery(buildSearchStatement('arsenal chelsea', { limit: 5 }))
    const json = params.find((p) => typeof p === 'string' && p.startsWith('[{')) as string
    expect(JSON.parse(json)).toEqual([
      { l: 'arsenal', r: 'chelsea', lc: '%arsenal%', rc: '%chelsea%', lp: 'arsenal%', rp: 'chelsea%' },
    ])
  })

  it('only includes trigram clauses from the fuzzy minimum length up', () => {
    const short = dialect.sqlToQuery(buildSearchStatement('liv', { limit: 5 })).sql
    const long = dialect.sqlToQuery(buildSearchStatement('livr', { limit: 5 })).sql
    expect(short).not.toContain('p.name %')
    expect(long).toContain('p.name %')
  })

  it('escapes LIKE wildcards inside the patterns it sends', () => {
    const { params } = dialect.sqlToQuery(buildSearchStatement('50%', { limit: 5 }))
    expect(params).toContain('%50\\%%')
  })
})
