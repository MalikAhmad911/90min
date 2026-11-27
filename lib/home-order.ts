import { FREE_COMPETITIONS } from './competitions'
import { isLive } from './utils'
import type { GroupedMatches, Match } from './types'

/**
 * How the home feed is ordered and filtered (PRD MAT-2, MAT-3).
 *
 * Pure functions only, so the rules can be tested without rendering anything:
 *   1. a "Following" section - matches of followed teams (and individually
 *      followed matches), then
 *   2. league groups for followed competitions, then
 *   3. the curated top leagues in a fixed order, then
 *   4. everything else A-Z by country, then by competition name.
 */

/** Curated order for the competitions people look for first. Matches the sidebar. */
export const CURATED_ORDER = [
  'WC',
  'PL',
  'CL',
  'PD',
  'BL1',
  'SA',
  'FL1',
  'ELC',
  'DED',
  'PPL',
  'BSA',
  'EC',
] as const

export type FeedMode = 'all' | 'live' | 'time'

export const FEED_MODES: { id: FeedMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'time', label: 'By time' },
]

export interface FollowIndex {
  teams: ReadonlySet<number>
  competitions: ReadonlySet<string>
  matches: ReadonlySet<number>
}

export const EMPTY_FOLLOWS: FollowIndex = {
  teams: new Set(),
  competitions: new Set(),
  matches: new Set(),
}

/** Builds lookup sets from the follows API's rows. Players do not affect the feed. */
export function followIndexFrom(
  follows: readonly { entityType: string; entityKey: string }[]
): FollowIndex {
  const teams = new Set<number>()
  const competitions = new Set<string>()
  const matches = new Set<number>()
  for (const f of follows) {
    if (f.entityType === 'team') teams.add(Number(f.entityKey))
    else if (f.entityType === 'competition') competitions.add(f.entityKey)
    else if (f.entityType === 'match') matches.add(Number(f.entityKey))
  }
  return { teams, competitions, matches }
}

/** True when the match belongs in the "Following" section. */
export function isFollowedMatch(match: Match, follows: FollowIndex): boolean {
  return (
    follows.matches.has(match.id) ||
    follows.teams.has(match.homeTeam.id) ||
    follows.teams.has(match.awayTeam.id)
  )
}

export interface FeedGroup extends GroupedMatches {
  code: string
  country: string
  /** The user follows this competition, so it is pinned above the curated list. */
  followed: boolean
}

export interface OrderedFeed {
  following: Match[]
  groups: FeedGroup[]
}

const COUNTRY_BY_CODE = new Map(FREE_COMPETITIONS.map((c) => [c.code, c.country]))

function byKickoff(a: Match, b: Match): number {
  const t = new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
  return t !== 0 ? t : a.id - b.id
}

function curatedRank(code: string): number {
  const i = (CURATED_ORDER as readonly string[]).indexOf(code)
  return i === -1 ? Number.POSITIVE_INFINITY : i
}

/** Sort key for one group: followed first, then curated, then country A-Z. */
function compareGroups(a: FeedGroup, b: FeedGroup): number {
  if (a.followed !== b.followed) return a.followed ? -1 : 1
  const ra = curatedRank(a.code)
  const rb = curatedRank(b.code)
  if (ra !== rb) return ra - rb
  const country = a.country.localeCompare(b.country, 'en')
  if (country !== 0) return country
  return a.competitionName.localeCompare(b.competitionName, 'en')
}

/**
 * Groups and orders a day's matches.
 *
 * Followed teams' matches appear in the Following section AND stay in their
 * league group: hiding them from the league would make that league look
 * incomplete to anyone scanning it, which is how FotMob behaves too.
 */
export function orderFeed(matches: readonly Match[], follows: FollowIndex): OrderedFeed {
  const sorted = [...matches].sort(byKickoff)
  const following = sorted.filter((m) => isFollowedMatch(m, follows))

  const map = new Map<string, FeedGroup>()
  for (const m of sorted) {
    const code = m.competition.code
    let group = map.get(code)
    if (!group) {
      group = {
        competitionId: m.competition.id,
        competitionName: m.competition.name,
        competitionEmblem: m.competition.emblem,
        code,
        // Unknown competitions sort by name in place of a country.
        country: COUNTRY_BY_CODE.get(code) ?? m.competition.name,
        followed: follows.competitions.has(code),
        matches: [],
      }
      map.set(code, group)
    }
    group.matches.push(m)
  }

  return { following, groups: [...map.values()].sort(compareGroups) }
}

export interface FeedFilter {
  mode: FeedMode
  /** Competition codes the user chose to hide with the Filter picker. */
  hidden: ReadonlySet<string>
}

/**
 * Applies the Live tab and the competition picker.
 *
 * "By time" does not remove anything; it only changes the layout (see
 * `buildFeed`). A followed team's match survives a hidden competition: the
 * follow is the more specific, more deliberate choice of the two.
 */
export function filterMatches(
  matches: readonly Match[],
  filter: FeedFilter,
  follows: FollowIndex = EMPTY_FOLLOWS
): Match[] {
  return matches.filter((m) => {
    if (filter.mode === 'live' && !isLive(m.status)) return false
    if (filter.hidden.has(m.competition.code) && !isFollowedMatch(m, follows)) return false
    return true
  })
}

export type Feed =
  | { layout: 'grouped'; following: Match[]; groups: FeedGroup[]; total: number }
  | { layout: 'flat'; matches: Match[]; total: number }

/** The whole feed for one day: filter, then either group or flatten. */
export function buildFeed(
  matches: readonly Match[],
  follows: FollowIndex,
  filter: FeedFilter
): Feed {
  const kept = filterMatches(matches, filter, follows)
  if (filter.mode === 'time') {
    // One chronological list across leagues (PRD MAT-3, "By time").
    return { layout: 'flat', matches: [...kept].sort(byKickoff), total: kept.length }
  }
  const ordered = orderFeed(kept, follows)
  return {
    layout: 'grouped',
    following: ordered.following,
    // A followed match from a hidden competition shows in Following only; a
    // league group the user hid must not reappear holding just that match.
    groups: ordered.groups.filter((g) => !filter.hidden.has(g.code)),
    total: kept.length,
  }
}
