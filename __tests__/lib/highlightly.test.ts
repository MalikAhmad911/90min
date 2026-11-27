import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  isFinishedState,
  isLiveState,
  mapEventType,
  normaliseLineups,
  normaliseStatistics,
  parseEventTime,
  parseLineups,
  parseMatchDetail,
  parseMatchList,
  parseScore,
  planEventRows,
  refereeName,
  vanishedEventIds,
  type HlEvent,
} from '@/lib/providers/highlightly/parse'
import {
  BudgetExhaustedError,
  createHighlightlyClient,
  dailyCap,
  memoryBudget,
} from '@/lib/providers/highlightly/client'
import { HIGHLIGHTLY_LEAGUES } from '@/lib/providers/highlightly/leagues'

/** Saved real responses (2026-11-28): PL 2026-11-21, Chelsea 1-4 Leeds. */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), '__tests__/fixtures/highlightly', name), 'utf8'))
}

const CHELSEA_HL = 42483
const LEEDS_HL = 54397
const CHELSEA = 61
const LEEDS = 341

describe('Highlightly parsing (saved fixtures)', () => {
  it('parses a match list', () => {
    const { matches, invalid, total } = parseMatchList(fixture('matches-pl-2026-11-21.json'))
    expect(invalid).toBe(0)
    expect(total).toBe(7)
    expect(matches).toHaveLength(7)
    const chelsea = matches.find((m) => m.id === 1325407754)!
    expect(chelsea.homeTeam).toEqual({ id: CHELSEA_HL, name: 'Chelsea' })
    expect(chelsea.league.id).toBe(33973)
    expect(parseScore(chelsea.state?.score?.current)).toEqual({ home: 1, away: 4 })
    expect(isFinishedState(chelsea.state?.description)).toBe(true)
  })

  it('rejects a list without data', () => {
    expect(() => parseMatchList({ message: 'nope' })).toThrow()
  })

  it('parses a match detail with events and statistics, dropping unknown fields', () => {
    const d = parseMatchDetail(fixture('match-1325407754.json'))
    expect(d.id).toBe(1325407754)
    expect(d.events).toHaveLength(19)
    expect(d.statistics).toHaveLength(2)
    expect(refereeName(d.referee?.name)).toBe('Michael Oliver')
    expect((d as Record<string, unknown>).news).toBeUndefined()
  })

  it('parses lineups and orients them to our home side', () => {
    const raw = parseLineups(fixture('lineups-1325407754.json'))
    const straight = normaliseLineups(raw, CHELSEA_HL)!
    expect(straight.home.formation).toBe('4-2-3-1')
    expect(straight.home.rows.map((r) => r.length)).toEqual([1, 4, 2, 3, 1])
    expect(straight.home.rows[0][0]).toEqual({ name: 'E. Martínez', number: 1, position: 'Goalkeeper' })
    expect(straight.home.bench).toHaveLength(9)
    expect(straight.away.formation).toBe('3-4-2-1')
    // Our home is upstream's away: sides swap.
    const swapped = normaliseLineups(raw, LEEDS_HL)!
    expect(swapped.home.formation).toBe('3-4-2-1')
    expect(normaliseLineups({ homeTeam: null, awayTeam: null }, 1)).toBeNull()
  })
})

describe('parseEventTime', () => {
  it.each([
    ['8', 8, null],
    ['90+3', 90, 3],
    ['45+2', 45, 2],
    ['120+1', 120, 1],
    [" 90 + 11'", 90, 11],
    [67, 67, null],
    ['90+0', 90, null],
  ])('%s', (input, minute, added) => {
    expect(parseEventTime(input)).toEqual({ minute, addedTime: added })
  })

  it('returns nulls for junk and out-of-range values', () => {
    expect(parseEventTime('HT')).toEqual({ minute: null, addedTime: null })
    expect(parseEventTime(null)).toEqual({ minute: null, addedTime: null })
    expect(parseEventTime('200')).toEqual({ minute: null, addedTime: null })
    expect(parseEventTime('90+45')).toEqual({ minute: 90, addedTime: null })
  })
})

describe('event mapping', () => {
  it('maps upstream types', () => {
    expect(mapEventType('Goal')).toBe('GOAL')
    expect(mapEventType('Penalty')).toBe('PENALTY_GOAL')
    expect(mapEventType('Own Goal')).toBe('OWN_GOAL')
    expect(mapEventType('Missed Penalty')).toBe('MISSED_PENALTY')
    expect(mapEventType('Red Card')).toBe('RED_CARD')
    expect(mapEventType('VAR Goal Cancelled - Offside')).toBe('VAR')
    expect(mapEventType('Something new')).toBeNull()
  })

  const ctx = { hlMatchId: 1325407754, hlHomeId: CHELSEA_HL, hlAwayId: LEEDS_HL, homeTeamId: CHELSEA, awayTeamId: LEEDS }

  it('plans rows from the real fixture: goals with running score, assists, subs in/out', () => {
    const d = parseMatchDetail(fixture('match-1325407754.json'))
    const rows = planEventRows(d.events ?? [], ctx, { home: 1, away: 4 })
    expect(rows).toHaveLength(19)
    const goals = rows.filter((r) => ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'].includes(r.type))
    expect(goals.map((g) => [g.scoreHome, g.scoreAway])).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
    ])
    expect(goals[0]).toMatchObject({ playerName: 'Emanuel Emegha', relatedPlayerName: 'Morgan Rogers', teamId: CHELSEA, minute: 25 })
    expect(goals[2].type).toBe('PENALTY_GOAL')
    expect(goals[4]).toMatchObject({ minute: 90, addedTime: 1, playerName: 'Brenden Aaronson' })
    // Substitution: `player` went off, `substituted` came on.
    const sub = rows.find((r) => r.type === 'SUBSTITUTION' && r.minute === 64 && r.relatedPlayerName === 'Emanuel Emegha')!
    expect(sub.playerName).toBe('Danny Welbeck')
    expect(new Set(rows.map((r) => r.providerEventId)).size).toBe(rows.length)
  })

  it('labels a second booking as SECOND_YELLOW and orients own goals by the score', () => {
    const team = (id: number) => ({ id, name: String(id) })
    const events: HlEvent[] = [
      { team: team(LEEDS_HL), time: '30', type: 'Yellow Card', player: 'A', playerId: 7 },
      { team: team(LEEDS_HL), time: '70', type: 'Red Card', player: 'A', playerId: 7 },
      { team: team(LEEDS_HL), time: '80', type: 'Own Goal', player: 'B', playerId: 8 },
    ]
    const rows = planEventRows(events, ctx, { home: 1, away: 0 })
    expect(rows[1].type).toBe('SECOND_YELLOW')
    expect(rows[2]).toMatchObject({ type: 'OWN_GOAL', teamId: CHELSEA, scoreHome: 1, scoreAway: 0 })
    // If the score says the event team is the credited side, follow the score.
    const other = planEventRows(events, ctx, { home: 0, away: 1 })
    expect(other[2]).toMatchObject({ teamId: LEEDS, scoreHome: 0, scoreAway: 1 })
  })

  it('reports events that disappeared upstream (to mark cancelled)', () => {
    const team = { id: CHELSEA_HL, name: 'Chelsea' }
    const before = planEventRows(
      [
        { team, time: '10', type: 'Goal', player: 'X', playerId: 1 },
        { team, time: '20', type: 'Goal', player: 'Y', playerId: 2 },
      ],
      ctx,
      null
    )
    const after = planEventRows([{ team, time: '20', type: 'Goal', player: 'Y', playerId: 2 }], ctx, null)
    const stored = before.map((r) => ({ providerEventId: r.providerEventId, isCancelled: false }))
    expect(vanishedEventIds(stored, after)).toEqual([before[0].providerEventId])
    // Already-cancelled rows are not reported again.
    expect(vanishedEventIds([{ ...stored[0], isCancelled: true }, stored[1]], after)).toEqual([])
  })
})

describe('normaliseStatistics', () => {
  it('normalises the real fixture, including xG, derived shots and pass accuracy', () => {
    const d = parseMatchDetail(fixture('match-1325407754.json'))
    const lines = normaliseStatistics(d.statistics, CHELSEA_HL, LEEDS_HL)
    const by = Object.fromEntries(lines.map((l) => [l.key, [l.home, l.away]]))
    expect(by.possession).toEqual([57, 43])
    expect(by.xg).toEqual([0.64, 2.77])
    expect(by.shots).toEqual([14, 21])
    expect(by.shots_on_target).toEqual([3, 8])
    expect(by.big_chances).toEqual([0, 7])
    expect(by.corners).toEqual([3, 2])
    expect(by.fouls).toEqual([6, 16])
    expect(by.offsides).toEqual([2, 7])
    expect(by.yellow_cards).toEqual([1, 3])
    expect(by.red_cards).toEqual([0, 0])
    expect(by.passes).toEqual([557, 407])
    expect(by.pass_accuracy).toEqual([87, 82])
    expect(lines[0].key).toBe('possession')
  })

  it('swaps to our orientation and drops one-sided stats', () => {
    const d = parseMatchDetail(fixture('match-1325407754.json'))
    const lines = normaliseStatistics(d.statistics, LEEDS_HL, CHELSEA_HL)
    expect(lines.find((l) => l.key === 'xg')).toMatchObject({ home: 2.77, away: 0.64 })
    expect(normaliseStatistics([], 1, 2)).toEqual([])
    expect(
      normaliseStatistics([{ team: { id: 1, name: 'a' }, statistics: [{ displayName: 'Corners', value: 4 }] }], 1, 2)
    ).toEqual([])
  })
})

describe('states and leagues', () => {
  it('classifies states', () => {
    expect(isFinishedState('Finished after penalties')).toBe(true)
    expect(isFinishedState('Postponed')).toBe(false)
    expect(isLiveState('Second half')).toBe(true)
    expect(isLiveState('Finished')).toBe(false)
  })

  it('pins one league id per competition', () => {
    const ids = HIGHLIGHTLY_LEAGUES.map((l) => l.leagueId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(HIGHLIGHTLY_LEAGUES.find((l) => l.code === 'PL')?.leagueId).toBe(33973)
  })
})

describe('Highlightly client budget guard', () => {
  function okResponse(body: unknown, remaining?: number): Response {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (remaining !== undefined) {
      headers.set('x-ratelimit-requests-remaining', String(remaining))
      headers.set('x-ratelimit-requests-limit', '100')
    }
    return new Response(JSON.stringify(body), { status: 200, headers })
  }

  const now = () => new Date('2026-11-28T12:00:00Z')

  it('refuses to call upstream once the cap is reached', async () => {
    const fetchImpl = vi.fn(async () => okResponse(fixture('lineups-1325407754.json')))
    const budget = memoryBudget()
    const client = createHighlightlyClient({ budget, cap: 2, apiKey: 'k', fetchImpl, now })
    await client.lineups(1)
    await client.lineups(1)
    await expect(client.lineups(1)).rejects.toBeInstanceOf(BudgetExhaustedError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(client.requests).toBe(2)
    expect(await client.remaining()).toBe(0)
  })

  it('raises the count to what upstream reports and sends the key only as a header', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      okResponse(fixture('matches-pl-2026-11-21.json'), 40)
    )
    const budget = memoryBudget()
    const client = createHighlightlyClient({ budget, cap: 90, apiKey: 'secret-key', fetchImpl, now })
    const list = await client.listMatches({ date: '2026-11-21', leagueId: 33973 })
    expect(list).toHaveLength(7)
    expect(await budget.used(now())).toBe(60) // 100 - 40 remaining
    expect(await client.remaining()).toBe(30)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe('https://soccer.highlightly.net/matches?date=2026-11-21&leagueId=33973&limit=100')
    expect(String(url)).not.toContain('secret-key')
    expect((init?.headers as Record<string, string>)['x-rapidapi-key']).toBe('secret-key')
  })

  it('treats a 429 as the day being spent', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 429 }))
    const budget = memoryBudget()
    const client = createHighlightlyClient({ budget, cap: 90, apiKey: 'k', fetchImpl, now })
    await expect(client.matchDetail(5)).rejects.toMatchObject({ status: 429 })
    await expect(client.matchDetail(5)).rejects.toBeInstanceOf(BudgetExhaustedError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('needs a key and valid parameters before spending anything', async () => {
    const fetchImpl = vi.fn()
    const budget = memoryBudget()
    const client = createHighlightlyClient({ budget, cap: 90, apiKey: '', fetchImpl, now })
    await expect(client.matchDetail(1)).rejects.toThrow('HIGHLIGHTLY_API_KEY')
    const keyed = createHighlightlyClient({ budget, cap: 90, apiKey: 'k', fetchImpl, now })
    await expect(keyed.listMatches({ date: '21-11-2026', leagueId: 1 })).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await budget.used(now())).toBe(0)
  })

  it('reads the cap from the environment within bounds', () => {
    expect(dailyCap(undefined)).toBe(90)
    expect(dailyCap('50')).toBe(50)
    expect(dailyCap('500')).toBe(90)
  })
})
