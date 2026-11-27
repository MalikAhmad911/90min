/**
 * Finds the highlights video of one match in a channel's recent uploads.
 *
 * A video counts only when its title names BOTH teams and it was published
 * between kick-off and 72 hours after it. That rules out previews, press
 * conferences and last season's meeting of the same clubs. When in doubt we
 * show nothing rather than the wrong match.
 */

export interface MatchSide {
  name: string
  shortName?: string | null
  tla?: string | null
}

export interface HighlightCandidate {
  title: string
  publishedAt: Date
}

const WINDOW_MS = 72 * 60 * 60 * 1000

/** Words that say nothing about which club it is. */
const NOISE = new Set([
  'fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ss', 'ssc', 'us', 'rc', 'cd', 'ud', 'sd', 'rcd', 'sv', 'vfb', 'vfl',
  'tsg', 'fsv', 'bv', 'bsc', 'ogc', 'losc', 'club', 'de', 'del', 'la', 'le', 'the', 'and', 'city', 'united',
  'real', 'calcio', 'football', 'futbol', 'futebol', 'clube', 'sport', 'sporting', '1', '04', '05', '1899',
  '1846', '1907', '1910', '1913', '1919',
])

/**
 * Cities with more than one club: never enough on their own to name a team
 * ("Manchester" must not turn a Manchester City video into a United one).
 */
const SHARED_CITY = new Set([
  'manchester', 'madrid', 'milan', 'milano', 'sheffield', 'bristol', 'nottingham', 'london', 'lisbon',
  'lisboa', 'porto', 'rome', 'roma', 'genoa', 'genova', 'turin', 'torino', 'seville', 'sevilla', 'munich',
  'munchen', 'paris', 'birmingham', 'liverpool', 'glasgow', 'sao', 'paulo', 'rio', 'janeiro', 'belo',
  'horizonte', 'porto alegre', 'alegre', 'buenos', 'aires',
])

/** Lower-case, accents removed, punctuation to spaces. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Distinctive words of a club name ("Manchester United FC" -> manchester). */
function keyWords(name: string): string[] {
  return normalise(name)
    .split(' ')
    .filter((w) => w.length >= 3 && !NOISE.has(w))
}

/**
 * Ways a title may refer to a club. Short names come first because broadcasters
 * use them ("Man City", "Spurs" are not derivable, so short names matter).
 */
export function aliasesFor(side: MatchSide): string[] {
  const out = new Set<string>()
  for (const raw of [side.shortName, side.name]) {
    if (!raw) continue
    const full = normalise(raw)
    if (full.length >= 3) out.add(full)
    // "Manchester United FC" -> "manchester united"
    const stripped = full
      .split(' ')
      .filter((w) => !['fc', 'cf', 'afc', 'sc'].includes(w))
      .join(' ')
    if (stripped.length >= 3) out.add(stripped)
  }
  // A single distinctive word ("Brighton", "Wolverhampton") when it is long
  // enough not to collide with ordinary words.
  for (const w of keyWords(side.name)) if (w.length >= 5 && !SHARED_CITY.has(w)) out.add(w)
  if (side.shortName) {
    for (const w of keyWords(side.shortName)) if (w.length >= 4 && !SHARED_CITY.has(w)) out.add(w)
  }
  // Three-letter codes are only trusted in upper case in the raw title.
  return [...out]
}

function mentions(normalisedTitle: string, alias: string): boolean {
  return ` ${normalisedTitle} `.includes(` ${alias} `)
}

function mentionsSide(rawTitle: string, side: MatchSide): boolean {
  const title = normalise(rawTitle)
  if (aliasesFor(side).some((a) => mentions(title, a))) return true
  // "ARS 2-1 CHE" style titles: exact upper-case code as a whole word.
  if (side.tla && /^[A-Z]{3}$/.test(side.tla)) {
    return new RegExp(`(^|[^A-Za-z])${side.tla}([^A-Za-z]|$)`).test(rawTitle)
  }
  return false
}

export function isHighlightOf(
  video: HighlightCandidate,
  match: { utcDate: string | Date; homeTeam: MatchSide; awayTeam: MatchSide }
): boolean {
  const kickoff = new Date(match.utcDate).getTime()
  const published = video.publishedAt.getTime()
  if (!Number.isFinite(kickoff) || published < kickoff || published - kickoff > WINDOW_MS) return false
  return mentionsSide(video.title, match.homeTeam) && mentionsSide(video.title, match.awayTeam)
}

/** The earliest qualifying video (the first upload is usually the highlights). */
export function findMatchHighlight<V extends HighlightCandidate>(
  videos: V[],
  match: { utcDate: string | Date; homeTeam: MatchSide; awayTeam: MatchSide }
): V | null {
  const hits = videos.filter((v) => isHighlightOf(v, match))
  hits.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  return hits[0] ?? null
}
