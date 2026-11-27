import type { Match, StandingsTable } from '@/lib/types'

/**
 * Plain-text descriptions of entities, shared by <meta> tags and JSON-LD.
 *
 * Everything here is formatted in UTC with a fixed locale. These strings are
 * rendered on the server and cached, so they must not depend on the server's
 * own timezone or locale - a crawler in one region and a build machine in
 * another would otherwise see different text for the same match.
 */

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

/**
 * "Sat 29 Nov 2026". Assembled from parts because ICU versions disagree on
 * the punctuation ("Sat, 29 Nov" vs "Sat 29 Nov"), and a build machine and a
 * serverless runtime should not describe the same match differently.
 */
export function formatUtcDate(iso: string): string {
  const parts = Object.fromEntries(
    DATE_FMT.formatToParts(new Date(iso)).map((p) => [p.type, p.value])
  ) as Partial<Record<Intl.DateTimeFormatPartTypes, string>>
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`
}

/** "Sat 29 Nov 2026, 15:00 UTC" */
export function formatUtcKickoff(iso: string): string {
  return `${formatUtcDate(iso)}, ${TIME_FMT.format(new Date(iso))} UTC`
}

/** The name a reader knows a team by: "Arsenal" rather than "Arsenal FC". */
export function teamLabel(team: { name: string; shortName?: string | null }): string {
  return team.shortName?.trim() || team.name
}

/** "Arsenal vs Chelsea" */
export function matchName(match: Pick<Match, 'homeTeam' | 'awayTeam'>): string {
  return `${teamLabel(match.homeTeam)} vs ${teamLabel(match.awayTeam)}`
}

function scoreLine(match: Match): string | null {
  const { home, away } = match.score.fullTime
  if (home === null || away === null) return null
  return `${teamLabel(match.homeTeam)} ${home}-${away} ${teamLabel(match.awayTeam)}`
}

/** One sentence on where the match stands: result, live score, or kick-off. */
export function describeMatch(match: Match): string {
  const competition = match.competition.name
  const name = matchName(match)
  const score = scoreLine(match)

  switch (match.status) {
    case 'IN_PLAY':
    case 'PAUSED': {
      const clock = match.status === 'PAUSED' ? 'half time' : match.minute ? `${match.minute}'` : 'in play'
      return `Live: ${score ?? name} (${clock}). ${competition} live score, lineups, stats and head-to-head.`
    }
    case 'FINISHED':
      return `Full time: ${score ?? name}. ${competition}, ${formatUtcDate(match.utcDate)}. Goals, lineups, stats and head-to-head.`
    case 'POSTPONED':
      return `${name} (${competition}) has been postponed. It was due on ${formatUtcKickoff(match.utcDate)}.`
    case 'CANCELLED':
      return `${name} (${competition}), due on ${formatUtcDate(match.utcDate)}, has been cancelled.`
    default:
      return `${name}, ${competition}. Kick-off ${formatUtcKickoff(match.utcDate)}. Live score, lineups, stats and head-to-head.`
  }
}

/** Fixtures and results summary for a team page. */
export function describeTeam(
  team: { name: string; shortName?: string | null },
  matches: Match[],
  now: number = Date.now()
): string {
  const label = teamLabel(team)
  const parts = [`${team.name} fixtures, results and live scores.`]

  const upcoming = matches.find((m) => new Date(m.utcDate).getTime() >= now && m.status !== 'FINISHED')
  const last = [...matches]
    .reverse()
    .find((m) => m.status === 'FINISHED' && new Date(m.utcDate).getTime() < now)

  if (last) {
    const score = scoreLine(last)
    if (score) parts.push(`Last result: ${score}.`)
  }
  if (upcoming) {
    parts.push(`Next: ${matchName(upcoming)}, ${formatUtcKickoff(upcoming.utcDate)}.`)
  }
  if (parts.length === 1) parts.push(`Follow ${label} on 90 Min Tactics.`)
  return parts.join(' ')
}

/** Competition summary, naming the current leader when a table exists. */
export function describeCompetition(
  competition: { name: string; country: string },
  tables: StandingsTable[] = []
): string {
  const base = `${competition.name} (${competition.country}) table, fixtures, results and top scorers.`
  // Only a single league ladder has a meaningful "leader"; a cup has one per group.
  const totals = tables.filter((t) => t.type === 'TOTAL')
  const leader = totals.length === 1 ? totals[0].table[0] : undefined
  if (!leader) return base
  return `${base} ${teamLabel(leader.team)} lead on ${leader.points} points after ${leader.playedGames} games.`
}
