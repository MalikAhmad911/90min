import { RateLimiter } from '@/lib/server/rate-limiter'
import { cached, type CachePolicy, type PolicyInput } from '@/lib/server/cache'
import { FREE_COMPETITION_CODES as COMPETITION_CODES } from '@/lib/competitions'
import { formatDate } from '@/lib/utils'
import type {
  Match,
  MatchDetail,
  CompetitionStandings,
  CompetitionInfo,
  Scorer,
  TeamDetail,
} from '@/lib/types'

const BASE = 'https://api.football-data.org/v4'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The competition catalogue lives in `lib/competitions.ts` so that client
 * components can import it without dragging `fs` (via the disk cache) into
 * the browser bundle. Re-exported here for callers already on this module.
 *
 * Note what is NOT in that list: the Europa League (EL) and Copa Libertadores
 * (CLI) used to be requested by this client, but they are paid-tier only -
 * every request for them came back 403 and was silently discarded.
 */
export { FREE_COMPETITIONS, FREE_COMPETITION_CODES } from '@/lib/competitions'

/**
 * The free plan allows 10 requests per minute. We budget 9 so a stray call
 * (a retry, a warm-up) cannot tip the window over the edge.
 */
const limiter = new RateLimiter({ capacity: 9, intervalMs: MINUTE, name: 'football-data' })

export class FootballDataError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string
  ) {
    super(message)
    this.name = 'FootballDataError'
  }
}

/** How long to back off for, taken from the 429 response. */
function retryAfterMs(res: Response, body: string): number {
  const header = res.headers.get('Retry-After')
  if (header && !Number.isNaN(Number(header))) return Number(header) * SECOND
  // football-data answers e.g. "You reached your request limit. Wait 36 seconds."
  const seconds = body.match(/(\d+)\s*second/i)?.[1]
  if (seconds) return Number(seconds) * SECOND
  return MINUTE
}

/**
 * One throttled, error-surfacing call to the provider.
 *
 * Unlike the previous client this never swallows a failure: a 429 pauses the
 * whole limiter and throws, so the cache layer can decide to serve stale data
 * instead of quietly returning an empty league.
 */
async function request<T>(endpoint: string): Promise<T> {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) throw new FootballDataError('FOOTBALL_DATA_API_KEY is not set', 0, endpoint)

  return limiter.schedule(async () => {
    const res = await fetch(`${BASE}${endpoint}`, {
      headers: { 'X-Auth-Token': key },
      // We do our own caching; Next's fetch cache would double-cache and
      // hide quota accounting from us.
      cache: 'no-store',
    })

    if (res.status === 429) {
      const body = await res.text().catch(() => '')
      const wait = retryAfterMs(res, body)
      limiter.pauseFor(wait)
      throw new FootballDataError(
        `Rate limited by football-data.org - backing off ${Math.round(wait / SECOND)}s`,
        429,
        endpoint
      )
    }

    if (res.status === 403) {
      throw new FootballDataError(
        'This resource is not available on your football-data.org plan',
        403,
        endpoint
      )
    }

    if (!res.ok) {
      throw new FootballDataError(`Upstream responded ${res.status}`, res.status, endpoint)
    }

    return (await res.json()) as T
  })
}

/* ------------------------------------------------------------------ *
 * Cache policies
 * ------------------------------------------------------------------ */

const LIVE_STATUSES = ['IN_PLAY', 'PAUSED']
const SETTLED_STATUSES = ['FINISHED', 'CANCELLED', 'POSTPONED', 'AWARDED', 'SUSPENDED']

/**
 * How hard to refresh a day's fixture list:
 *  - something is live       -> 30s
 *  - a kickoff is near       -> 60s
 *  - everything has finished -> 6h (results no longer change)
 *  - otherwise               -> 15min
 */
export function matchListPolicy(current: Match[] | undefined): CachePolicy {
  const staleMs = 30 * DAY
  if (!current || current.length === 0) return { freshMs: 15 * MINUTE, staleMs: 6 * HOUR }

  if (current.some((m) => LIVE_STATUSES.includes(m.status))) {
    return { freshMs: 30 * SECOND, staleMs }
  }

  const now = Date.now()
  const kickoffNear = current.some((m) => {
    const delta = new Date(m.utcDate).getTime() - now
    return delta > -3 * HOUR && delta < 3 * HOUR
  })
  if (kickoffNear) return { freshMs: MINUTE, staleMs }

  if (current.every((m) => SETTLED_STATUSES.includes(m.status))) {
    return { freshMs: 6 * HOUR, staleMs }
  }

  return { freshMs: 15 * MINUTE, staleMs }
}

export function matchDetailPolicy(current: MatchDetail | undefined): CachePolicy {
  const staleMs = 30 * DAY
  if (!current) return { freshMs: 2 * MINUTE, staleMs: 6 * HOUR }
  if (LIVE_STATUSES.includes(current.status)) return { freshMs: 30 * SECOND, staleMs }
  // A played match is immutable - never spend quota refreshing it.
  if (SETTLED_STATUSES.includes(current.status)) return { freshMs: DAY, staleMs }
  return { freshMs: 5 * MINUTE, staleMs }
}

const STANDINGS_POLICY: CachePolicy = { freshMs: 10 * MINUTE, staleMs: 30 * DAY }
const SCORERS_POLICY: CachePolicy = { freshMs: HOUR, staleMs: 30 * DAY }
const STATIC_POLICY: CachePolicy = { freshMs: DAY, staleMs: 90 * DAY }

/**
 * A competition's full season of fixtures. Warming all twelve costs twelve
 * requests; after that every date in the season is free. Refreshed hourly so
 * final scores and postponements land, kept for a month so a provider outage
 * never empties the calendar.
 */
const SEASON_POLICY: CachePolicy = { freshMs: HOUR, staleMs: 30 * DAY }

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

interface FDMatch {
  id: number
  utcDate: string
  status: string
  minute?: number
  group?: string
  stage?: string
  homeTeam: Match['homeTeam']
  awayTeam: Match['awayTeam']
  score: Match['score']
  competition: Match['competition']
}

function toMatch(m: FDMatch): Match {
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status as Match['status'],
    minute: m.minute,
    group: m.group,
    stage: m.stage,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    score: m.score,
    competition: m.competition,
  }
}

function byKickoff(a: Match, b: Match): number {
  return new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
}

/* ------------------------------------------------------------------ *
 * Resources
 * ------------------------------------------------------------------ */

/**
 * What the free tier actually allows, measured against a real TIER_ONE key:
 *
 *   /v4/matches?dateFrom=D&dateTo=D   -> count: 0   (date range is blocked,
 *                                                    and it 200s instead of
 *                                                    erroring, so an empty
 *                                                    result is NOT proof that
 *                                                    there was no football)
 *   /v4/matches                       -> works      (covers today + tomorrow)
 *   /v4/competitions/PL/matches       -> works      (whole season, 1 request)
 *
 * So there are two paths:
 *
 *  - today / tomorrow -> the bare cross-competition endpoint. One request,
 *    carries live scores.
 *  - any other date   -> the per-competition season cache. Twelve requests to
 *    warm, then every other date in the season is served without touching the
 *    provider at all.
 */

/** Dates the bare `/v4/matches` window covers, in UTC. */
function liveWindowDates(): string[] {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return [formatDate(today), formatDate(tomorrow)]
}

/** The current season's fixtures for one competition. One upstream request. */
async function loadCompetitionSeason(code: string): Promise<Match[]> {
  const data = await request<{ matches: FDMatch[] }>(`/competitions/${code}/matches`)
  return (data.matches ?? []).map(toMatch)
}

function seasonFor(code: string) {
  return cached<Match[]>(`season:${code}`, SEASON_POLICY, () => loadCompetitionSeason(code))
}

/** Pulls a date out of the cached season fixtures of every free competition. */
async function loadFromSeasons(date: string): Promise<Match[]> {
  const results = await Promise.allSettled(COMPETITION_CODES.map((code) => seasonFor(code)))

  const failures = results.filter((r) => r.status === 'rejected')
  // Nothing came back at all - that is an outage, not a quiet day.
  if (failures.length === results.length) {
    throw (failures[0] as PromiseRejectedResult).reason
  }

  const seen = new Set<number>()
  const matches: Match[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const match of result.value.value) {
      if (!match.utcDate.startsWith(date) || seen.has(match.id)) continue
      seen.add(match.id)
      matches.push(match)
    }
  }

  return matches.sort(byKickoff)
}

async function loadMatchesByDate(date: string): Promise<Match[]> {
  if (liveWindowDates().includes(date)) {
    try {
      const data = await request<{ matches: FDMatch[] }>('/matches')
      return (data.matches ?? [])
        .map(toMatch)
        .filter((m) => m.utcDate.startsWith(date))
        .sort(byKickoff)
    } catch (err) {
      // A 429 must not be papered over with twelve more requests.
      if (err instanceof FootballDataError && err.status === 429) throw err
      return loadFromSeasons(date)
    }
  }

  return loadFromSeasons(date)
}

export async function fetchMatchesByDate(date: string) {
  return cached<Match[]>(`matches:${date}`, matchListPolicy, () => loadMatchesByDate(date))
}

export async function fetchMatchDetail(id: number) {
  return cached<MatchDetail>(
    `match:${id}`,
    matchDetailPolicy as PolicyInput<MatchDetail>,
    () => request<MatchDetail>(`/matches/${id}`)
  )
}

export async function fetchHeadToHead(id: number, limit = 10) {
  return cached<{ matches: Match[] }>(`h2h:${id}:${limit}`, STATIC_POLICY, async () => {
    const data = await request<{ matches: FDMatch[] }>(`/matches/${id}/head2head?limit=${limit}`)
    return { matches: (data.matches ?? []).map(toMatch) }
  })
}

export async function fetchStandings(competition: string) {
  return cached<CompetitionStandings>(`standings:${competition}`, STANDINGS_POLICY, () =>
    request<CompetitionStandings>(`/competitions/${competition}/standings`)
  )
}

export async function fetchScorers(competition: string, limit = 20) {
  return cached<{ scorers: Scorer[]; competition: CompetitionInfo }>(
    `scorers:${competition}:${limit}`,
    SCORERS_POLICY,
    () =>
      request<{ scorers: Scorer[]; competition: CompetitionInfo }>(
        `/competitions/${competition}/scorers?limit=${limit}`
      )
  )
}

export async function fetchCompetitionMatches(competition: string, season?: number) {
  const query = season ? `?season=${season}` : ''
  return cached<Match[]>(
    `competition-matches:${competition}:${season ?? 'current'}`,
    matchListPolicy,
    async () => {
      const data = await request<{ matches: FDMatch[] }>(
        `/competitions/${competition}/matches${query}`
      )
      return (data.matches ?? []).map(toMatch).sort(byKickoff)
    }
  )
}

export async function fetchCompetition(competition: string) {
  return cached<CompetitionInfo>(`competition:${competition}`, STATIC_POLICY, () =>
    request<CompetitionInfo>(`/competitions/${competition}`)
  )
}

export async function fetchTeam(id: number) {
  return cached<TeamDetail>(`team:${id}`, STATIC_POLICY, () => request<TeamDetail>(`/teams/${id}`))
}

export async function fetchTeamMatches(id: number, limit = 20) {
  return cached<Match[]>(`team-matches:${id}:${limit}`, matchListPolicy, async () => {
    const data = await request<{ matches: FDMatch[] }>(`/teams/${id}/matches?limit=${limit}`)
    return (data.matches ?? []).map(toMatch).sort(byKickoff)
  })
}

/** Diagnostics for the admin page - how much quota is left right now. */
export function quotaStatus() {
  return {
    available: limiter.available,
    capacity: 9,
    paused: limiter.isPaused,
  }
}
