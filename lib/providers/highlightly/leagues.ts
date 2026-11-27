/**
 * Highlightly league ids for our competitions, pinned.
 *
 * `leagueName` alone is ambiguous upstream ("Premier League" also matches
 * Jamaica's), so every request names the league by id. Ids were read from
 * GET /leagues?countryName=<country> on 2026-11-28; all list season 2026.
 *
 * Tiers set the budget priority (100 requests/day on the free plan):
 *   1 - fetched first, live matches refreshed while budget allows;
 *   2 - finished matches only, and only when budget remains.
 * WC and EC are left out until a tournament is running.
 */

export interface HighlightlyLeague {
  /** Our competition code. */
  code: string
  leagueId: number
  /** Upstream name and country, for logs and for re-checking the pin. */
  name: string
  country: string
  tier: 1 | 2
}

export const HIGHLIGHTLY_LEAGUES: readonly HighlightlyLeague[] = [
  { code: 'PL', leagueId: 33973, name: 'Premier League', country: 'England', tier: 1 },
  { code: 'CL', leagueId: 2486, name: 'UEFA Champions League', country: 'World', tier: 1 },
  { code: 'PD', leagueId: 119924, name: 'La Liga', country: 'Spain', tier: 1 },
  { code: 'BL1', leagueId: 67162, name: 'Bundesliga', country: 'Germany', tier: 1 },
  { code: 'SA', leagueId: 115669, name: 'Serie A', country: 'Italy', tier: 1 },
  { code: 'FL1', leagueId: 52695, name: 'Ligue 1', country: 'France', tier: 1 },
  { code: 'ELC', leagueId: 34824, name: 'Championship', country: 'England', tier: 2 },
  { code: 'DED', leagueId: 75672, name: 'Eredivisie', country: 'Netherlands', tier: 2 },
  { code: 'PPL', leagueId: 80778, name: 'Primeira Liga', country: 'Portugal', tier: 2 },
  { code: 'BSA', leagueId: 61205, name: 'Serie A', country: 'Brazil', tier: 2 },
]

export const HIGHLIGHTLY_COMPETITIONS: readonly string[] = HIGHLIGHTLY_LEAGUES.map((l) => l.code)

export function highlightlyLeague(code: string): HighlightlyLeague | undefined {
  return HIGHLIGHTLY_LEAGUES.find((l) => l.code === code)
}

/** Terms: shown on our own pages with attribution; never re-served as a feed. */
export const HIGHLIGHTLY_ATTRIBUTION = {
  provider: 'Highlightly',
  text: 'Match data: Highlightly',
  url: 'https://highlightly.net',
} as const
