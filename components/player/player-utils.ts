/**
 * Pure helpers shared by the player page, the squad list and their tests.
 *
 * Kept free of server imports so client components can use them.
 */

/** The four lines football-data groups a squad into, plus a bucket for the rest. */
export type PositionGroup = 'Goalkeeper' | 'Defence' | 'Midfield' | 'Offence' | 'Unknown'

export const POSITION_GROUPS: { id: PositionGroup; label: string }[] = [
  { id: 'Goalkeeper', label: 'Goalkeepers' },
  { id: 'Defence', label: 'Defenders' },
  { id: 'Midfield', label: 'Midfielders' },
  { id: 'Offence', label: 'Attackers' },
  { id: 'Unknown', label: 'Position unknown' },
]

/**
 * Maps a provider position to one of the four lines.
 *
 * The free tier sometimes sends the coarse line ("Defence") and sometimes a
 * detailed role ("Centre-Back", "Left Winger", "Defensive Midfield"), and
 * TheSportsDB uses its own wording again ("Centre-Forward"). Matching on
 * keywords covers all three without a table of every spelling.
 */
export function positionGroup(position: string | null | undefined): PositionGroup {
  if (!position) return 'Unknown'
  const p = position.toLowerCase()
  if (p.includes('goal') || p === 'gk') return 'Goalkeeper'
  // "Defensive Midfield" is a midfielder, so midfield is checked before defence.
  if (p.includes('midfield')) return 'Midfield'
  if (p.includes('defen') || p.includes('back')) return 'Defence'
  if (
    p.includes('offence') ||
    p.includes('offense') ||
    p.includes('attack') ||
    p.includes('forward') ||
    p.includes('striker') ||
    p.includes('wing')
  ) {
    return 'Offence'
  }
  return 'Unknown'
}

/** Groups players into the four lines, in display order, dropping empty groups. */
export function groupByPosition<T extends { position: string | null }>(
  players: T[]
): { group: PositionGroup; label: string; players: T[] }[] {
  const buckets = new Map<PositionGroup, T[]>()
  for (const p of players) {
    const g = positionGroup(p.position)
    const list = buckets.get(g) ?? []
    list.push(p)
    buckets.set(g, list)
  }
  return POSITION_GROUPS.filter((g) => buckets.has(g.id)).map((g) => ({
    group: g.id,
    label: g.label,
    players: buckets.get(g.id)!,
  }))
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Age in whole years on `today`, or null for a missing or malformed date.
 *
 * Computed in UTC from the calendar date alone: a date of birth has no time
 * zone, and parsing it with `new Date()` in a local zone can shift it a day.
 */
export function ageOn(dateOfBirth: string | null | undefined, today: Date = new Date()): number | null {
  const m = dateOfBirth ? ISO_DATE.exec(dateOfBirth.slice(0, 10)) : null
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null

  let age = today.getUTCFullYear() - y
  const beforeBirthday =
    today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 120 ? age : null
}

/** "Erling Haaland" -> "EH", "Rodri" -> "R". */
export function playerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * "Manchester City FC" -> "Manchester City".
 *
 * football-data names clubs formally; a page title or a byline reads better
 * without the legal suffix. Only a trailing suffix is removed, so
 * "AFC Bournemouth" keeps its name.
 */
export function displayClubName(name: string): string {
  const stripped = name.replace(/\s+(FC|AFC|CF|SC)$/i, '').trim()
  return stripped || name
}
