import { normaliseName } from '@/lib/providers/wikidata'

/**
 * Matching our clubs (football-data names) to Wikidata items.
 *
 * Used offline by `scripts/wikidata-club-qids.ts`, whose output is the
 * reviewed mapping in `club-qids.ts`. Nothing here runs on a page render.
 *
 * The candidate pool does most of the work: the script only offers clubs that
 * Wikidata lists in the same league (P118), so "Sporting" can only ever be
 * compared with the eighteen-odd Portuguese top-flight clubs, not with every
 * Sporting on Earth. Within that pool the rules below decide, and an
 * ambiguous result is refused rather than guessed.
 */

/**
 * Words that say "this is a club" rather than which club. Dropped from both
 * sides before comparing, so "Arsenal FC" and "Arsenal F.C." agree, as do
 * "Bayer 04 Leverkusen" and "Bayer Leverkusen".
 */
const GENERIC = new Set([
  'fc', 'cf', 'afc', 'sc', 'ac', 'as', 'cd', 'ud', 'sd', 'rc', 'rcd', 'ss', 'ssc', 'us',
  'sv', 'vfb', 'vfl', 'tsg', 'fsv', 'bv', 'ec', 'se', 'cr', 'ca', 'sl', 'sad', 'fk', 'sk',
  'kv', 'pae', 'hsc', 'osc', 'ogc', 'losc', 'aj', 'ea', 'sco', 'nk', 'pfc', 'bk', 'if',
  'club', 'clube', 'calcio', 'futbol', 'futebol', 'football', 'fussball', 'fussballclub',
  'de', 'del', 'da', 'do', 'des', 'la', 'le', 'the', 'and', 'e', 'y', 'ev',
])

/** Name -> comparable tokens: accents and punctuation gone, generic words and numbers dropped. */
export function clubTokens(name: string): string[] {
  return normaliseName(name)
    .split(' ')
    .filter((t) => t && !GENERIC.has(t) && !/^\d+$/.test(t))
}

/** The tokens joined, or '' when nothing distinctive is left. */
export function clubKey(name: string): string {
  return clubTokens(name).join(' ')
}

export interface ClubCandidate {
  qid: string
  /** Labels and aliases, any language. */
  names: string[]
}

export interface ClubMatch {
  qid: string
  /** 3 = identical name, 2 = identical distinctive words, 1 = one name's words contain the other's. */
  score: 1 | 2 | 3
}

function scoreName(team: { full: string; keys: string[]; tokens: string[] }, name: string): 0 | 1 | 2 | 3 {
  if (normaliseName(name) === team.full) return 3
  const key = clubKey(name)
  if (!key) return 0
  if (team.keys.includes(key)) return 2

  // Containment either way, e.g. "Bournemouth" in "AFC Bournemouth 1899" or
  // "Tottenham Hotspur" in "Tottenham". Needs a real word in common - two
  // short abbreviations agreeing is not evidence.
  const theirs = key.split(' ')
  const ours = team.tokens
  const shared = ours.filter((t) => theirs.includes(t))
  if (!shared.some((t) => t.length >= 4)) return 0
  const oursInTheirs = ours.every((t) => theirs.includes(t))
  const theirsInOurs = theirs.every((t) => ours.includes(t))
  return oursInTheirs || theirsInOurs ? 1 : 0
}

/**
 * The single Wikidata item that is this club, or null.
 *
 * Every candidate gets the best score any of its names earns; the highest
 * score wins only if exactly one item holds it. Two items tied at the top
 * (a club and its reserve side, a duplicate item) means "don't know".
 */
export function matchClub(
  team: { name: string; shortName?: string | null },
  candidates: ClubCandidate[]
): ClubMatch | null {
  const tokens = clubTokens(team.name)
  const keys = [clubKey(team.name), team.shortName ? clubKey(team.shortName) : ''].filter(Boolean)
  const subject = { full: normaliseName(team.name), keys, tokens }

  const best = new Map<string, number>()
  for (const c of candidates) {
    let score = best.get(c.qid) ?? 0
    for (const name of c.names) score = Math.max(score, scoreName(subject, name))
    if (score > 0) best.set(c.qid, score)
  }
  if (best.size === 0) return null

  const top = Math.max(...best.values())
  const winners = [...best].filter(([, s]) => s === top)
  if (winners.length !== 1) return null
  return { qid: winners[0][0], score: top as 1 | 2 | 3 }
}
