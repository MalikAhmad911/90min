import type { CompetitionMeta } from '@/lib/competitions'
import type { Match, MatchStatus, StandingsTable } from '@/lib/types'
import { absoluteUrl, paths } from './site'
import { describeCompetition, describeMatch, matchName } from './describe'

/**
 * schema.org structured data for entity pages.
 *
 * The builders return plain objects; `serializeJsonLd` is the only way they
 * should reach HTML. Every string in them can come from the provider via the
 * database (team names, venues), so nothing is trusted to be markup-safe.
 */

type JsonLd = Record<string, unknown>

const SPORT = 'Soccer'

// Built from code points so the source file never contains the raw characters.
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g')
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g')

/**
 * JSON for an inline <script type="application/ld+json">.
 *
 * JSON.stringify alone is not enough: a value containing `</script>` would end
 * the script element and let the rest be parsed as HTML. Escaping `<` as
 * < makes that impossible while remaining identical JSON to a parser.
 * `>` and `&` are escaped for the same belt-and-braces reason, and U+2028 /
 * U+2029 because some JavaScript parsers treat them as line terminators.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029')
}

/** Only absolute http(s) URLs are passed on; anything else is dropped, not rewritten. */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * schema.org has no "finished" or "live" status: an event that went ahead as
 * planned stays EventScheduled. Only postponement and cancellation differ.
 */
export function eventStatusFor(status: MatchStatus | string): string {
  switch (status) {
    case 'POSTPONED':
    case 'SUSPENDED':
      return 'https://schema.org/EventPostponed'
    case 'CANCELLED':
      return 'https://schema.org/EventCancelled'
    default:
      return 'https://schema.org/EventScheduled'
  }
}

function sportsTeam(team: { id: number; name: string; crest?: string | null }): JsonLd {
  return {
    '@type': 'SportsTeam',
    name: team.name,
    sport: SPORT,
    url: absoluteUrl(paths.team(team.id)),
    ...(safeHttpUrl(team.crest) ? { logo: safeHttpUrl(team.crest) } : {}),
  }
}

export function matchJsonLd(match: Match, extras: { venue?: string | null } = {}): JsonLd {
  const home = sportsTeam(match.homeTeam)
  const away = sportsTeam(match.awayTeam)
  const venue = extras.venue?.trim()
  const images = [match.homeTeam.crest, match.awayTeam.crest]
    .map(safeHttpUrl)
    .filter((u): u is string => Boolean(u))

  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${matchName(match)} – ${match.competition.name}`,
    description: describeMatch(match),
    url: absoluteUrl(paths.match(match.id)),
    sport: SPORT,
    startDate: match.utcDate,
    eventStatus: eventStatusFor(match.status),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    homeTeam: home,
    awayTeam: away,
    competitor: [home, away],
    ...(images.length ? { image: images } : {}),
    // A Place with no name or address is worse than none, so only emit a real venue.
    ...(venue ? { location: { '@type': 'Place', name: venue } } : {}),
    superEvent: {
      '@type': 'SportsEvent',
      name: match.competition.name,
      url: absoluteUrl(paths.competition(match.competition.code)),
    },
  }
}

export function teamJsonLd(
  team: { id: number; name: string; shortName?: string | null; tla?: string | null; crest?: string | null },
  matches: Match[] = []
): JsonLd {
  const alternateNames = [team.shortName, team.tla]
    .map((n) => n?.trim())
    .filter((n): n is string => Boolean(n) && n !== team.name)

  // The competitions this team appears in, as seen in its own fixtures.
  const leagues = new Map<string, string>()
  for (const m of matches) leagues.set(m.competition.code, m.competition.name)

  return {
    '@context': 'https://schema.org',
    ...sportsTeam(team),
    ...(alternateNames.length ? { alternateName: [...new Set(alternateNames)] } : {}),
    ...(leagues.size
      ? {
          memberOf: [...leagues].map(([code, name]) => ({
            '@type': 'SportsOrganization',
            name,
            url: absoluteUrl(paths.competition(code)),
          })),
        }
      : {}),
  }
}

/** A league is modelled as the organisation its member teams belong to. */
export function competitionJsonLd(competition: CompetitionMeta, tables: StandingsTable[] = []): JsonLd {
  const members = new Map<number, JsonLd>()
  for (const t of tables) {
    if (t.type !== 'TOTAL') continue
    for (const row of t.table) members.set(row.team.id, sportsTeam(row.team))
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: competition.name,
    alternateName: competition.code,
    description: describeCompetition(competition, tables),
    sport: SPORT,
    url: absoluteUrl(paths.competition(competition.code)),
    ...(safeHttpUrl(competition.emblem) ? { logo: safeHttpUrl(competition.emblem) } : {}),
    areaServed: competition.country,
    ...(members.size ? { member: [...members.values()] } : {}),
  }
}
