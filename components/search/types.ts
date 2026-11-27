/**
 * Shapes shared by the search API, the /search page and the TopNav combobox.
 *
 * Kept free of any server import so the client bundle can use it.
 */

export type SearchItemType = 'team' | 'competition' | 'player' | 'match'

export interface SearchItem {
  type: SearchItemType
  /** Stable per type: team/player/match ids, or a competition code. */
  id: string
  label: string
  /** Secondary line: league for a team, team for a player, date for a match. */
  sublabel: string
  /** Crest, emblem or photo. Null means "render initials". */
  image: string | null
  /** Away crest for a match; absent for every other type. */
  image2?: string | null
  /** Name used for the second crest's alt text / initials (matches only). */
  label2?: string
  href: string
}

export interface SearchResults {
  /** The normalised query these results were produced for. */
  query: string
  teams: SearchItem[]
  competitions: SearchItem[]
  players: SearchItem[]
  matches: SearchItem[]
}

export type SearchGroupKey = 'teams' | 'competitions' | 'players' | 'matches'

/** Display order and headings. Teams first: they are what people look for most. */
export const SEARCH_GROUPS: ReadonlyArray<{ key: SearchGroupKey; title: string }> = [
  { key: 'teams', title: 'Teams' },
  { key: 'competitions', title: 'Competitions' },
  { key: 'players', title: 'Players' },
  { key: 'matches', title: 'Matches' },
]

export function totalResults(r: SearchResults): number {
  return r.teams.length + r.competitions.length + r.players.length + r.matches.length
}
