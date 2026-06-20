import type { Broadcaster, Country } from './types'

/** Countries we currently curate broadcaster data for. */
export const COUNTRIES: Country[] = [
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
]

export const DEFAULT_COUNTRY = COUNTRIES[0]

/** Supported competitions (football-data codes) for the admin defaults UI. */
export const COMPETITIONS: { code: string; name: string }[] = [
  { code: 'PL', name: 'Premier League' },
  { code: 'CL', name: 'UEFA Champions League' },
  { code: 'EL', name: 'UEFA Europa League' },
  { code: 'PD', name: 'La Liga' },
  { code: 'SA', name: 'Serie A' },
  { code: 'BL1', name: 'Bundesliga' },
  { code: 'FL1', name: 'Ligue 1' },
  { code: 'ELC', name: 'Championship' },
  { code: 'DED', name: 'Eredivisie' },
  { code: 'PPL', name: 'Primeira Liga' },
]

/**
 * Curated "where to watch" mapping: competition code -> country code -> broadcasters.
 * Links point to the broadcaster's live/home page (FotMob-style where-to-watch).
 * Competition codes match football-data.org (PL, CL, EL, PD, SA, BL1, FL1, ...).
 */
export const BROADCASTERS: Record<string, Record<string, Broadcaster[]>> = {
  // Premier League
  PL: {
    GB: [
      { name: 'Sky Sports', url: 'https://www.skysports.com/watch/football', kind: 'tv' },
      { name: 'TNT Sports', url: 'https://www.tntsports.co.uk/', kind: 'tv' },
    ],
    US: [
      { name: 'NBC Sports', url: 'https://www.nbcsports.com/soccer/premier-league', kind: 'tv' },
      { name: 'Peacock', url: 'https://www.peacocktv.com/sports/premier-league', kind: 'stream' },
    ],
    IN: [
      { name: 'Star Sports', url: 'https://www.hotstar.com/in/sports/football', kind: 'tv' },
      { name: 'Disney+ Hotstar', url: 'https://www.hotstar.com/in/sports/football', kind: 'stream' },
    ],
    PK: [{ name: 'beIN Sports', url: 'https://www.beinsports.com/', kind: 'tv' }],
  },

  // UEFA Champions League
  CL: {
    GB: [{ name: 'TNT Sports', url: 'https://www.tntsports.co.uk/', kind: 'tv' }],
    US: [{ name: 'Paramount+', url: 'https://www.paramountplus.com/sports/uefa-champions-league/', kind: 'stream' }],
    IN: [{ name: 'Sony LIV', url: 'https://www.sonyliv.com/', kind: 'stream' }],
    PK: [{ name: 'beIN Sports', url: 'https://www.beinsports.com/', kind: 'tv' }],
  },

  // UEFA Europa League
  EL: {
    GB: [{ name: 'TNT Sports', url: 'https://www.tntsports.co.uk/', kind: 'tv' }],
    US: [{ name: 'Paramount+', url: 'https://www.paramountplus.com/', kind: 'stream' }],
    IN: [{ name: 'Sony LIV', url: 'https://www.sonyliv.com/', kind: 'stream' }],
    PK: [{ name: 'beIN Sports', url: 'https://www.beinsports.com/', kind: 'tv' }],
  },

  // La Liga
  PD: {
    GB: [{ name: 'Premier Sports', url: 'https://www.premiersports.com/', kind: 'tv' }],
    US: [{ name: 'ESPN+', url: 'https://www.espn.com/espnplus/', kind: 'stream' }],
    IN: [{ name: 'Sports18 / JioCinema', url: 'https://www.jiocinema.com/sports', kind: 'stream' }],
    PK: [{ name: 'beIN Sports', url: 'https://www.beinsports.com/', kind: 'tv' }],
  },

  // Serie A
  SA: {
    GB: [{ name: 'TNT Sports', url: 'https://www.tntsports.co.uk/', kind: 'tv' }],
    US: [{ name: 'Paramount+', url: 'https://www.paramountplus.com/', kind: 'stream' }],
    IN: [{ name: 'Sports18 / JioCinema', url: 'https://www.jiocinema.com/sports', kind: 'stream' }],
    PK: [{ name: 'beIN Sports', url: 'https://www.beinsports.com/', kind: 'tv' }],
  },

  // Bundesliga
  BL1: {
    GB: [{ name: 'Sky Sports', url: 'https://www.skysports.com/watch/football', kind: 'tv' }],
    US: [{ name: 'ESPN+', url: 'https://www.espn.com/espnplus/', kind: 'stream' }],
    IN: [{ name: 'Sony LIV', url: 'https://www.sonyliv.com/', kind: 'stream' }],
    PK: [{ name: 'beIN Sports', url: 'https://www.beinsports.com/', kind: 'tv' }],
  },

  // Ligue 1
  FL1: {
    GB: [{ name: 'TNT Sports', url: 'https://www.tntsports.co.uk/', kind: 'tv' }],
    US: [{ name: 'beIN Sports / Fubo', url: 'https://www.fubo.tv/', kind: 'stream' }],
    IN: [{ name: 'Sports18 / JioCinema', url: 'https://www.jiocinema.com/sports', kind: 'stream' }],
    PK: [{ name: 'beIN Sports', url: 'https://www.beinsports.com/', kind: 'tv' }],
  },

  // Championship (England)
  ELC: {
    GB: [{ name: 'Sky Sports', url: 'https://www.skysports.com/watch/football', kind: 'tv' }],
    US: [{ name: 'Paramount+', url: 'https://www.paramountplus.com/', kind: 'stream' }],
  },

  // Eredivisie
  DED: {
    GB: [{ name: 'Premier Sports', url: 'https://www.premiersports.com/', kind: 'tv' }],
    US: [{ name: 'ESPN+', url: 'https://www.espn.com/espnplus/', kind: 'stream' }],
  },

  // Primeira Liga (Portugal)
  PPL: {
    GB: [{ name: 'Premier Sports', url: 'https://www.premiersports.com/', kind: 'tv' }],
    US: [{ name: 'GolTV / Fubo', url: 'https://www.fubo.tv/', kind: 'stream' }],
  },
}

/**
 * Returns the curated broadcasters for a competition in a country.
 * Empty array when no data exists — callers should show a
 * "Check local listings" fallback.
 */
export function getWatchOptions(competitionCode: string, countryCode: string): Broadcaster[] {
  return BROADCASTERS[competitionCode]?.[countryCode] ?? []
}
