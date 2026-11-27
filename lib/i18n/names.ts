/**
 * Localised names for the entities we curate ourselves: competitions,
 * their regions and the Watch page's countries.
 *
 * Team and player names come from the data provider in English and are NOT
 * translated here - transliterating 500 club names by hand would drift from
 * the data. The planned source is Wikidata's Urdu labels (CC0), looked up by
 * the provider's team id; until then they render as the provider sends them.
 * Every helper takes the provider's English text as the fallback, so a code
 * this file has never heard of still shows something sensible.
 */

import { translateOr, type TFunction } from './translate'

export function competitionName(t: TFunction, code: string, fallback: string): string {
  return translateOr(t, `competition.${code.toUpperCase()}`, fallback)
}

/** Short form for tight spaces (sidebar), else the full name. */
export function competitionShortName(t: TFunction, code: string, fallback: string): string {
  const upper = code.toUpperCase()
  return translateOr(t, `competitionShort.${upper}`, competitionName(t, upper, fallback))
}

/** `country` field of lib/competitions.ts, e.g. 'England' -> 'انگلینڈ'. */
export function regionName(t: TFunction, region: string): string {
  return translateOr(t, `region.${region}`, region)
}

/** ISO code of a Watch-page country, e.g. 'PK' -> 'پاکستان'. */
export function countryName(t: TFunction, code: string, fallback: string): string {
  return translateOr(t, `country.${code.toUpperCase()}`, fallback)
}
