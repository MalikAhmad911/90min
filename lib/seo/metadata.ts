import type { Metadata } from 'next'
import type { CompetitionMeta } from '@/lib/competitions'
import type { Match, StandingsTable } from '@/lib/types'
import { SITE_NAME, paths } from './site'
import { describeCompetition, describeMatch, describeTeam, matchName } from './describe'

/**
 * Per-entity <head> metadata.
 *
 * Titles carry the site name explicitly instead of relying on a layout title
 * template: several existing pages already append it themselves, and a
 * template would double it on those.
 *
 * Canonical URLs are relative; `metadataBase` in the root layout makes them
 * absolute. That keeps one source of truth for the site origin.
 */

function withSite(title: string): string {
  return `${title} | ${SITE_NAME}`
}

function entityMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url: path,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

/** For an id that does not exist: a clear title, and kept out of the index. */
export function notFoundMetadata(kind: 'Match' | 'Team' | 'League'): Metadata {
  return {
    title: withSite(`${kind} not found`),
    robots: { index: false, follow: true },
  }
}

/** When the database is unavailable the page still renders, client-side, under a generic title. */
export function genericEntityMetadata(kind: 'Match centre' | 'Team', path: string): Metadata {
  return { title: withSite(kind), alternates: { canonical: path } }
}

/** "Arsenal vs Chelsea – Premier League | 90 Min Tactics" */
export function buildMatchMetadata(match: Match): Metadata {
  const title = withSite(`${matchName(match)} – ${match.competition.name}`)
  return entityMetadata(title, describeMatch(match), paths.match(match.id))
}

export function buildTeamMetadata(
  team: { id: number; name: string; shortName?: string | null },
  matches: Match[],
  now?: number
): Metadata {
  const title = withSite(`${team.name} – Fixtures, Results & Squad`)
  return entityMetadata(title, describeTeam(team, matches, now), paths.team(team.id))
}

export function buildCompetitionMetadata(
  competition: CompetitionMeta,
  tables?: StandingsTable[]
): Metadata {
  const title = withSite(`${competition.name} – Table, Fixtures & Top Scorers`)
  return entityMetadata(
    title,
    describeCompetition(competition, tables),
    // Always the code, so /leagues/2021 and /leagues/pl both point at /leagues/PL.
    paths.competition(competition.code)
  )
}
