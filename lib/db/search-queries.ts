import { sql, type SQL } from 'drizzle-orm'
import { getDb } from './index'
import type { SearchItem, SearchResults } from '@/components/search/types'

/**
 * Global search (PRD SR-1).
 *
 * Shape of the work:
 *   1. ONE SQL statement fetches a generous candidate set for every group.
 *      Neon is reached over HTTP, so each statement is a network round trip;
 *      four parallel queries would cost four, and the 150 ms budget is mostly
 *      latency, not execution.
 *   2. The final ranking happens here in TypeScript, in pure functions that the
 *      unit tests pin down. SQL only has to make sure the right rows are among
 *      the candidates; it does not have to get the order exactly right.
 *
 * Matching strategy:
 *   - Substring match on accent-folded names catches prefixes the trigram
 *     operators miss ("liv" scores well under pg_trgm's 0.3 threshold).
 *   - Trigram similarity catches typos ("man citty"), but only from 4
 *     characters up - below that, trigram matches are mostly noise.
 *   - teams (~250 rows) and competitions (12) are small enough that folding
 *     every name per query is sub-millisecond, so they get full accent
 *     insensitivity. players will be large, so that query sticks to operators
 *     the GIN trigram index can serve (ILIKE, %, <%).
 *
 * Every user-derived value reaches Postgres as a bind parameter through
 * drizzle's `sql` template. Nothing is ever concatenated into the SQL text.
 */

/* ------------------------------------------------------------------ *
 * Text folding - shared by TypeScript and SQL
 * ------------------------------------------------------------------ */

/**
 * Accented letter groups and the ASCII letter each folds to.
 *
 * The same table feeds `foldText` (TypeScript) and Postgres' `translate()`,
 * so both sides agree on what "atletico" matches. The database has no
 * `unaccent` extension, and adding one is a schema change outside this module.
 */
const FOLD_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['áàâäãåāăą', 'a'],
  ['çćč', 'c'],
  ['ďđ', 'd'],
  ['éèêëēėęě', 'e'],
  ['ğ', 'g'],
  ['íìîïīįı', 'i'],
  ['ł', 'l'],
  ['ñńň', 'n'],
  ['óòôöõøōő', 'o'],
  ['ř', 'r'],
  ['śšşș', 's'],
  ['ťţț', 't'],
  ['úùûüūůűų', 'u'],
  ['ýÿ', 'y'],
  ['źżž', 'z'],
  ['’‘', "'"],
]

/** `translate()` source and target strings: equal length, char for char. */
export const FOLD_FROM = FOLD_GROUPS.map(([from]) => from).join('')
export const FOLD_TO = FOLD_GROUPS.map(([from, to]) => to.repeat([...from].length)).join('')

const FOLD_MAP: ReadonlyMap<string, string> = new Map(
  FOLD_GROUPS.flatMap(([from, to]) => [...from].map((ch) => [ch, to] as const))
)

/**
 * Lower-cases, folds accents and collapses whitespace.
 * "  Club Atlético  de Madrid " -> "club atletico de madrid".
 */
export function foldText(s: string): string {
  const mapped = [...s.toLowerCase()].map((ch) => FOLD_MAP.get(ch) ?? ch).join('')
  // NFD + strip marks covers accents the table does not list. Postgres cannot
  // do this part, so the table above is what really matters for matching.
  return mapped.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()
}

/**
 * Escapes LIKE metacharacters so user text matches literally. The query is
 * still a bind parameter - this only stops "%" or "_" acting as wildcards.
 * Backslash is Postgres' default LIKE escape character.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

/** Higher is better. Tiers dominate; similarity only breaks ties within one. */
export const MatchTier = {
  None: 0,
  /** Matched only through a secondary field such as a country. */
  Weak: 1,
  /** The query appears somewhere inside a name. */
  Contains: 2,
  /** A word inside the name starts with the query: "city" in "Manchester City". */
  WordPrefix: 3,
  /** The name starts with the query: "liv" -> "Liverpool FC". */
  Prefix: 4,
  /** The whole name, short name or code equals the query. */
  Exact: 5,
} as const
export type MatchTier = (typeof MatchTier)[keyof typeof MatchTier]

export interface MatchFields {
  /** Names that can match at any tier. */
  names: Array<string | null | undefined>
  /** Codes that only count when equal to the query (TLA, competition code). */
  codes?: Array<string | null | undefined>
  /** Context that can only produce a weak match (a competition's country). */
  context?: Array<string | null | undefined>
}

/**
 * How well a folded query matches an entity's fields.
 * `fq` must already be folded with `foldText`.
 */
export function matchTier(fq: string, fields: MatchFields): MatchTier {
  if (!fq) return MatchTier.None
  let best: MatchTier = MatchTier.None
  const wordStart = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(fq)}`, 'u')

  for (const code of fields.codes ?? []) {
    if (code && foldText(code) === fq) return MatchTier.Exact
  }
  for (const raw of fields.names) {
    if (!raw) continue
    const name = foldText(raw)
    if (name === fq) return MatchTier.Exact
    if (name.startsWith(fq)) best = Math.max(best, MatchTier.Prefix) as MatchTier
    else if (wordStart.test(name)) best = Math.max(best, MatchTier.WordPrefix) as MatchTier
    else if (name.includes(fq)) best = Math.max(best, MatchTier.Contains) as MatchTier
  }
  if (best === MatchTier.None) {
    for (const raw of fields.context ?? []) {
      if (raw && wordStart.test(foldText(raw))) return MatchTier.Weak
    }
  }
  return best
}

export interface RankInput {
  fields: MatchFields
  /** Trigram similarity from Postgres, 0..1. */
  sim: number
  /** Shown name; shorter wins a tie ("Arsenal FC" before "Arsenal de Sarandí"). */
  label: string
}

/**
 * Orders candidates: match tier, then trigram similarity, then shorter name,
 * then alphabetical so the order is deterministic. Candidates that matched no
 * tier still survive (they came from the fuzzy trigram search: typos), but
 * always below every literal match.
 */
export function rankCandidates<T>(
  fq: string,
  rows: readonly T[],
  describe: (row: T) => RankInput,
  limit: number
): T[] {
  return rows
    .map((row) => {
      const d = describe(row)
      return { row, tier: matchTier(fq, d.fields), sim: Number(d.sim) || 0, label: d.label }
    })
    .sort(
      (a, b) =>
        b.tier - a.tier ||
        b.sim - a.sim ||
        a.label.length - b.label.length ||
        a.label.localeCompare(b.label)
    )
    .slice(0, limit)
    .map((r) => r.row)
}

/* ------------------------------------------------------------------ *
 * "team a team b" -> head-to-head
 * ------------------------------------------------------------------ */

/** Words that join two team names rather than belong to one. */
const CONNECTORS = new Set(['vs', 'v', 'x', '-', 'and', '&'])
/** Each half must be this long, or "a" in "liverpool a" pulls in half the league. */
const MIN_SIDE_LENGTH = 3
/** Caps the split points tried, keeping the query bounded. */
const MAX_WORDS = 6

export interface TeamPair {
  l: string
  r: string
}

/**
 * Every way to cut a folded query into two team names.
 * "arsenal vs chelsea" -> [{ l: 'arsenal', r: 'chelsea' }]
 * "man city liverpool" -> [{ l: 'man', r: 'city liverpool' }, { l: 'man city', r: 'liverpool' }]
 *
 * SQL then resolves both halves to teams and keeps the pairs that actually
 * played, so a wrong cut simply finds nothing.
 */
export function teamPairSplits(fq: string): TeamPair[] {
  const words = fq
    .split(' ')
    .filter((w) => w && !CONNECTORS.has(w))
  if (words.length < 2 || words.length > MAX_WORDS) return []

  const pairs: TeamPair[] = []
  for (let i = 1; i < words.length; i++) {
    const l = words.slice(0, i).join(' ')
    const r = words.slice(i).join(' ')
    if (l.length >= MIN_SIDE_LENGTH && r.length >= MIN_SIDE_LENGTH) pairs.push({ l, r })
  }
  return pairs
}

/* ------------------------------------------------------------------ *
 * Row -> SearchItem
 * ------------------------------------------------------------------ */

export interface TeamRow {
  id: number
  name: string
  shortName: string | null
  tla: string | null
  crest: string | null
  league: string | null
  sim: number
}

export interface CompetitionRow {
  code: string
  name: string
  shortName: string
  country: string
  emblem: string | null
  sim: number
}

export interface PlayerRow {
  id: number
  name: string
  position: string | null
  photoUrl: string | null
  teamName: string | null
  sim: number
}

export interface MatchRow {
  id: number
  utcDate: string
  status: string
  homeScore: number | null
  awayScore: number | null
  homeName: string
  homeShort: string | null
  homeCrest: string | null
  awayName: string
  awayShort: string | null
  awayCrest: string | null
  competitionName: string
}

export function teamToItem(r: TeamRow): SearchItem {
  return {
    type: 'team',
    id: String(r.id),
    label: r.name,
    sublabel: r.league ?? 'Team',
    image: r.crest || null,
    href: `/team/${r.id}`,
  }
}

export function competitionToItem(r: CompetitionRow): SearchItem {
  return {
    type: 'competition',
    id: r.code,
    label: r.name,
    sublabel: r.country,
    image: r.emblem || null,
    href: `/leagues/${encodeURIComponent(r.code)}`,
  }
}

export function playerToItem(r: PlayerRow): SearchItem {
  const sub = [r.teamName, r.position].filter(Boolean).join(' · ')
  return {
    type: 'player',
    id: String(r.id),
    label: r.name,
    sublabel: sub || 'Player',
    image: r.photoUrl || null,
    href: `/player/${r.id}`,
  }
}

// Fixed locale and UTC: the same string is rendered on the server and in the
// client, so it must not depend on either side's settings.
const MATCH_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED'])

export function matchToItem(r: MatchRow): SearchItem {
  const parts = [r.competitionName, MATCH_DATE.format(new Date(r.utcDate))]
  const hasScore = r.homeScore != null && r.awayScore != null
  if (LIVE_STATUSES.has(r.status) && hasScore) parts.push(`LIVE ${r.homeScore}–${r.awayScore}`)
  else if (r.status === 'FINISHED' && hasScore) parts.push(`FT ${r.homeScore}–${r.awayScore}`)
  else if (r.status === 'POSTPONED' || r.status === 'CANCELLED') parts.push(r.status.toLowerCase())

  const home = r.homeShort || r.homeName
  const away = r.awayShort || r.awayName
  return {
    type: 'match',
    id: String(r.id),
    label: `${home} vs ${away}`,
    sublabel: parts.join(' · '),
    image: r.homeCrest || null,
    image2: r.awayCrest || null,
    label2: away,
    href: `/match/${r.id}`,
  }
}

/* ------------------------------------------------------------------ *
 * The query
 * ------------------------------------------------------------------ */

/** Trigram matching only from this many characters - shorter is noise. */
export const FUZZY_MIN_LENGTH = 4
/** pg_trgm's own default `similarity_threshold`, applied explicitly. */
const SIMILARITY_MIN = 0.3
/** "arsnal" vs "arsenal fc" scores 0.5; typos that bad are still worth showing. */
const WORD_SIMILARITY_MIN = 0.5
/** Cup competitions: a team's "home" competition is its league, not these. */
const CUP_CODES = ['CL', 'EC', 'WC']

function fold(column: SQL): SQL {
  return sql`translate(lower(${column}), ${FOLD_FROM}, ${FOLD_TO})`
}

function list<T>(value: unknown): T[] {
  // The Neon driver parses json columns, but be robust to a raw string.
  if (typeof value === 'string') return JSON.parse(value) as T[]
  return Array.isArray(value) ? (value as T[]) : []
}

interface SearchRow extends Record<string, unknown> {
  teams: unknown
  competitions: unknown
  players: unknown
  matches: unknown
}

/** Clamps a caller's per-group limit to something sane. */
function clampLimit(limit: number): number {
  return Math.max(1, Math.min(50, Math.floor(limit) || 1))
}

/**
 * Builds the single search statement. Exported so tests can prove the query
 * text never contains user input, and so it can be fed to EXPLAIN ANALYZE.
 * `q` must be a validated, normalised query (see `searchQuerySchema`).
 */
export function buildSearchStatement(q: string, opts: { limit: number }): SQL {
  const limit = clampLimit(opts.limit)
  const fq = foldText(q)
  const contains = `%${escapeLike(fq)}%`
  const prefix = `${escapeLike(fq)}%`
  const rawContains = `%${escapeLike(q)}%`
  const rawPrefix = `${escapeLike(q)}%`
  const fuzzy = fq.length >= FUZZY_MIN_LENGTH
  // Over-fetch so the TypeScript ranking has real choices to make.
  const candidates = Math.max(limit * 3, 15)

  const pairs = teamPairSplits(fq).map(({ l, r }) => ({
    l,
    r,
    lc: `%${escapeLike(l)}%`,
    rc: `%${escapeLike(r)}%`,
    lp: `${escapeLike(l)}%`,
    rp: `${escapeLike(r)}%`,
  }))

  // Fuzzy clauses are added in TypeScript rather than switched by a bind
  // parameter, so short queries never even plan the trigram scans.
  const teamFuzzy = fuzzy
    ? sql`or similarity(ft.fn, ${fq}) > ${SIMILARITY_MIN}
          or similarity(ft.fs, ${fq}) > ${SIMILARITY_MIN}
          or word_similarity(${fq}, ft.fn) >= ${WORD_SIMILARITY_MIN}`
    : sql``
  const compFuzzy = fuzzy
    ? sql`or similarity(fc.fn, ${fq}) > ${SIMILARITY_MIN}
          or word_similarity(${fq}, fc.fn) >= ${WORD_SIMILARITY_MIN}`
    : sql``
  // `%` and `<%` use the session thresholds (0.3 / 0.6) and, unlike the
  // function forms, can be answered from players_name_trgm_idx.
  const playerFuzzy = fuzzy ? sql`or p.name % ${q} or ${q} <% p.name` : sql``

  return sql`
    with
    ft as (
      select t.id, t.name, t.short_name, t.tla, t.crest,
             ${fold(sql`t.name`)} as fn,
             ${fold(sql`coalesce(t.short_name, '')`)} as fs
      from teams t
    ),
    team_c as (
      select ft.*,
             greatest(similarity(ft.fn, ${fq}), similarity(ft.fs, ${fq}), word_similarity(${fq}, ft.fn)) as sim
      from ft
      where ft.fn like ${contains} or ft.fs like ${contains}
         or lower(coalesce(ft.tla, '')) = ${fq}
         ${teamFuzzy}
      order by (ft.fn like ${prefix} or ft.fs like ${prefix}) desc, sim desc, ft.name
      limit ${candidates}
    ),
    team_out as (
      select c.id, c.name, c.short_name as "shortName", c.tla, c.crest, c.sim, lg.name as league
      from team_c c
      left join lateral (
        -- The competition of the team's latest league fixture: "Premier League"
        -- tells a reader more than a country would. Two index lookups rather
        -- than one OR, so both (team_id, utc_date) indexes are usable.
        select comp.name
        from (
          (select competition_code, utc_date from matches where home_team_id = c.id)
          union all
          (select competition_code, utc_date from matches where away_team_id = c.id)
        ) m
        join competitions comp on comp.code = m.competition_code
        order by (comp.code in (${sql.join(CUP_CODES.map((c) => sql`${c}`), sql`, `)})) asc, m.utc_date desc
        limit 1
      ) lg on true
    ),
    fc as (
      select c.code, c.name, c.short_name, c.country, c.emblem,
             ${fold(sql`c.name`)} as fn,
             ${fold(sql`c.short_name`)} as fs,
             ${fold(sql`c.country`)} as fco
      from competitions c
    ),
    comp_out as (
      select fc.code, fc.name, fc.short_name as "shortName", fc.country, fc.emblem,
             greatest(similarity(fc.fn, ${fq}), similarity(fc.fs, ${fq}), word_similarity(${fq}, fc.fn)) as sim
      from fc
      where fc.fn like ${contains} or fc.fs like ${contains}
         or lower(fc.code) = ${fq}
         or fc.fco like ${prefix}
         ${compFuzzy}
      order by (fc.fn like ${prefix} or fc.fs like ${prefix}) desc, sim desc, fc.name
      limit ${candidates}
    ),
    player_out as (
      select p.id, p.name, p.position, p.photo_url as "photoUrl",
             coalesce(pt.short_name, pt.name) as "teamName",
             greatest(similarity(p.name, ${q}), word_similarity(${q}, p.name)) as sim
      from players p
      left join teams pt on pt.id = p.current_team_id
      where p.name ilike ${rawContains}
         ${playerFuzzy}
      order by (p.name ilike ${rawPrefix}) desc, sim desc, p.name
      limit ${candidates}
    ),
    pairs as (
      select * from jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb)
        as p(l text, r text, lc text, rc text, lp text, rp text)
    ),
    -- A query that is itself the start of a team name ("manchester city",
    -- "real madrid") is a team search, not "manchester" vs "city".
    full_hit as (
      select exists (select 1 from ft where ft.fn like ${prefix} or ft.fs like ${prefix}) as hit
    ),
    pair_teams as (
      select distinct a.id as a_id, b.id as b_id
      from pairs p
      cross join lateral (
        select ft.id from ft
        where ft.fn like p.lc or ft.fs like p.lc
        order by (ft.fn like p.lp or ft.fs like p.lp) desc, length(ft.fn), ft.id
        limit 2
      ) a
      cross join lateral (
        select ft.id from ft
        where ft.fn like p.rc or ft.fs like p.rc
        order by (ft.fn like p.rp or ft.fs like p.rp) desc, length(ft.fn), ft.id
        limit 2
      ) b
      where a.id <> b.id and not (select hit from full_hit)
    ),
    fixtures as (
      select a_id as home_id, b_id as away_id from pair_teams
      union
      select b_id, a_id from pair_teams
    ),
    match_out as (
      select m.id, m.utc_date as "utcDate", m.status,
             m.home_score_ft as "homeScore", m.away_score_ft as "awayScore",
             h.name as "homeName", h.short_name as "homeShort", h.crest as "homeCrest",
             aw.name as "awayName", aw.short_name as "awayShort", aw.crest as "awayCrest",
             c.name as "competitionName",
             -- Nearest to now first: the next meeting, then the last one.
             abs(extract(epoch from (m.utc_date - now()))) as distance
      from fixtures f
      join matches m on m.home_team_id = f.home_id and m.away_team_id = f.away_id
      join teams h on h.id = m.home_team_id
      join teams aw on aw.id = m.away_team_id
      join competitions c on c.code = m.competition_code
      order by distance asc
      limit ${limit}
    )
    select
      (select coalesce(json_agg(x), '[]'::json) from team_out x) as teams,
      (select coalesce(json_agg(x), '[]'::json) from comp_out x) as competitions,
      (select coalesce(json_agg(x), '[]'::json) from player_out x) as players,
      (select coalesce(json_agg(x order by x.distance), '[]'::json) from match_out x) as matches
  `
}

/**
 * Runs a validated, normalised query (see `searchQuerySchema`) and returns up
 * to `limit` items per group.
 */
export async function searchAll(q: string, opts: { limit: number }): Promise<SearchResults> {
  const limit = clampLimit(opts.limit)
  const fq = foldText(q)
  const result = await getDb().execute<SearchRow>(buildSearchStatement(q, { limit }))
  const row = (result.rows ?? (result as unknown as SearchRow[]))[0]

  const teams = rankCandidates(
    fq,
    list<TeamRow>(row?.teams),
    (t) => ({ fields: { names: [t.name, t.shortName], codes: [t.tla] }, sim: t.sim, label: t.name }),
    limit
  )
  const competitions = rankCandidates(
    fq,
    list<CompetitionRow>(row?.competitions),
    (c) => ({
      fields: { names: [c.name, c.shortName], codes: [c.code], context: [c.country] },
      sim: c.sim,
      label: c.name,
    }),
    limit
  )
  const players = rankCandidates(
    fq,
    list<PlayerRow>(row?.players),
    (p) => ({ fields: { names: [p.name] }, sim: p.sim, label: p.name }),
    limit
  )

  return {
    query: q,
    teams: teams.map(teamToItem),
    competitions: competitions.map(competitionToItem),
    players: players.map(playerToItem),
    matches: list<MatchRow>(row?.matches).map(matchToItem),
  }
}
