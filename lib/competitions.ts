/**
 * Catalogue of the competitions available on football-data.org's free tier.
 *
 * This module is deliberately dependency-free so client components can import
 * it. The API client in `lib/api/football-data.ts` pulls in `fs` (through the
 * disk cache) and must never reach a browser bundle.
 *
 * Source: https://www.football-data.org/coverage - "free forever".
 */

export interface CompetitionMeta {
  /** football-data competition code, e.g. 'PL'. Used in every API call. */
  code: string
  /** football-data numeric id, used by legacy /leagues/<id> links. */
  id: number
  name: string
  shortName: string
  country: string
  flag: string
  /**
   * Emblem URL exactly as the provider serves it.
   *
   * These are NOT derivable from the code. Guessing `${code}.png` 404s on half
   * the list - the provider uses `laliga.png` for PD, `c111.png` for SA,
   * `wm26.png` for WC, `ED.png` for DED, and lower case for EC and BSA.
   * Each URL below was confirmed to return 200.
   */
  emblem: string
}

const CRESTS = 'https://crests.football-data.org'

export const FREE_COMPETITIONS: CompetitionMeta[] = [
  { code: 'WC', id: 2000, name: 'FIFA World Cup', shortName: 'World Cup', country: 'World', flag: '🌍', emblem: `${CRESTS}/wm26.png` },
  { code: 'EC', id: 2018, name: 'European Championship', shortName: 'Euros', country: 'Europe', flag: '🇪🇺', emblem: `${CRESTS}/ec.png` },
  { code: 'CL', id: 2001, name: 'UEFA Champions League', shortName: 'Champions League', country: 'Europe', flag: '🇪🇺', emblem: `${CRESTS}/CL.png` },
  { code: 'PL', id: 2021, name: 'Premier League', shortName: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', emblem: `${CRESTS}/PL.png` },
  { code: 'ELC', id: 2016, name: 'Championship', shortName: 'Championship', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', emblem: `${CRESTS}/ELC.png` },
  { code: 'PD', id: 2014, name: 'La Liga', shortName: 'La Liga', country: 'Spain', flag: '🇪🇸', emblem: `${CRESTS}/laliga.png` },
  { code: 'BL1', id: 2002, name: 'Bundesliga', shortName: 'Bundesliga', country: 'Germany', flag: '🇩🇪', emblem: `${CRESTS}/BL1.png` },
  { code: 'SA', id: 2019, name: 'Serie A', shortName: 'Serie A', country: 'Italy', flag: '🇮🇹', emblem: `${CRESTS}/c111.png` },
  { code: 'FL1', id: 2015, name: 'Ligue 1', shortName: 'Ligue 1', country: 'France', flag: '🇫🇷', emblem: `${CRESTS}/FL1.png` },
  { code: 'DED', id: 2003, name: 'Eredivisie', shortName: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱', emblem: `${CRESTS}/ED.png` },
  { code: 'PPL', id: 2017, name: 'Primeira Liga', shortName: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹', emblem: `${CRESTS}/PPL.png` },
  { code: 'BSA', id: 2013, name: 'Brasileirao Serie A', shortName: 'Brasileirao', country: 'Brazil', flag: '🇧🇷', emblem: `${CRESTS}/bsa.png` },
]

export const FREE_COMPETITION_CODES: string[] = FREE_COMPETITIONS.map((c) => c.code)

/** Emblem URL for a competition, or null when we have none for that code. */
export function competitionEmblem(code: string): string | null {
  return FREE_COMPETITIONS.find((c) => c.code === code.toUpperCase())?.emblem ?? null
}

/**
 * Resolves a route segment to a competition.
 * Accepts the code ('PL') or the legacy numeric id ('2021').
 */
export function resolveCompetition(segment: string): CompetitionMeta | undefined {
  const upper = segment.toUpperCase()
  const byCode = FREE_COMPETITIONS.find((c) => c.code === upper)
  if (byCode) return byCode

  const asId = Number(segment)
  if (Number.isInteger(asId)) return FREE_COMPETITIONS.find((c) => c.id === asId)

  return undefined
}

/**
 * Cups publish a table per group and have no single league ladder; leagues do.
 * Used to pick the right default tab on a competition page.
 */
export function isCupCompetition(code: string): boolean {
  return code === 'WC' || code === 'EC' || code === 'CL'
}
