/**
 * Regenerates lib/transfers/club-qids.ts: our clubs (football-data team ids)
 * matched to Wikidata items. Run after a season's promotions, then review the
 * diff - a wrong match puts the wrong club's signings on /transfers.
 *
 *   npx tsx scripts/wikidata-club-qids.ts            # writes the file
 *   npx tsx scripts/wikidata-club-qids.ts --dry-run  # prints matches only
 *
 * Reads the database (read-only: teams and the competitions they play in) via
 * DATABASE_URL from .env.local, and makes two Wikidata queries.
 *
 * Why a generated, committed file rather than a lookup at render time: the
 * mapping changes once a season, a human can review it, and the /transfers
 * page then needs exactly one Wikidata query per render instead of two.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { literal, qidFromUri, sparqlSelect } from '@/lib/providers/wikidata'
import { matchClub, type ClubCandidate } from '@/lib/transfers/club-match'

config({ path: '.env.local' })

/**
 * Wikidata items of the domestic leagues we cover. Candidates for a club are
 * the items Wikidata lists in its league (P118), which keeps fuzzy matching
 * inside a pool of ~20-30 clubs.
 */
const LEAGUE_QIDS: Record<string, string> = {
  PL: 'Q9448',
  ELC: 'Q19510',
  PD: 'Q324867',
  BL1: 'Q82595',
  SA: 'Q15804',
  FL1: 'Q13394',
  DED: 'Q167541',
  PPL: 'Q182994',
  BSA: 'Q206813',
}

/** National-team tournaments: no transfers. */
const SKIP = new Set(['WC', 'EC'])

/** Languages whose labels and aliases we compare against. */
const LANGS = ['en', 'mul', 'de', 'es', 'it', 'fr', 'nl', 'pt', 'tr', 'cs', 'sk', 'no', 'uk', 'el', 'az']

/**
 * Hand-checked answers for clubs the rules cannot settle. Each one was looked
 * up on wikidata.org; keep the comment saying what the item is.
 */
const OVERRIDES: Record<number, string> = {}

type TeamRow = { id: number; name: string; short_name: string | null; comps: string }

async function loadTeams(): Promise<TeamRow[]> {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (.env.local)')
  const sql = neon(url)
  const rows = (await sql`
    select t.id, t.name, t.short_name, string_agg(distinct x.c, ',' order by x.c) as comps
    from teams t
    join (select competition_code c, home_team_id t from matches
          union select competition_code, away_team_id from matches) x on x.t = t.id
    group by t.id, t.name, t.short_name
    order by t.id`) as TeamRow[]
  return rows.map((r) => ({ ...r, id: Number(r.id) }))
}

function addName(pool: Map<string, ClubCandidate>, qid: string, name: string) {
  const c = pool.get(qid) ?? { qid, names: [] }
  c.names.push(name)
  pool.set(qid, c)
}

/** Clubs per league code, with their labels and aliases. One query. */
async function leagueCandidates(): Promise<Map<string, Map<string, ClubCandidate>>> {
  const byQid = new Map(Object.entries(LEAGUE_QIDS).map(([code, qid]) => [qid, code]))
  const bindings = (await sparqlSelect(
    `SELECT ?league ?club ?name WHERE {
      VALUES ?league { ${Object.values(LEAGUE_QIDS).map((q) => `wd:${q}`).join(' ')} }
      ?club wdt:P118 ?league .
      FILTER NOT EXISTS { ?club wdt:P31 wd:Q5 }
      ?club rdfs:label|skos:altLabel ?name .
      FILTER(LANG(?name) IN (${LANGS.map((l) => `"${l}"`).join(',')}))
    }`,
    { timeoutMs: 60_000 }
  )) as { league: { value: string }; club: { value: string }; name: { value: string } }[]

  const out = new Map<string, Map<string, ClubCandidate>>()
  for (const b of bindings) {
    const code = byQid.get(qidFromUri(b.league.value) ?? '')
    const qid = qidFromUri(b.club.value)
    if (!code || !qid) continue
    if (!out.has(code)) out.set(code, new Map())
    addName(out.get(code)!, qid, b.name.value)
  }
  return out
}

/**
 * Football clubs (P31 association football club) carrying one of these exact
 * names as a label or alias. For clubs outside our leagues (Champions League
 * entrants) and leftovers. One query.
 */
async function labelCandidates(names: string[]): Promise<Map<string, ClubCandidate>> {
  const values = [...new Set(names)].flatMap((n) => LANGS.map((l) => `${literal(n)}@${l}`)).join(' ')
  const bindings = (await sparqlSelect(
    `SELECT DISTINCT ?club ?name WHERE {
      VALUES ?hit { ${values} }
      ?club rdfs:label|skos:altLabel ?hit ;
            wdt:P31 wd:Q476028 .
      ?club rdfs:label|skos:altLabel ?name .
      FILTER(LANG(?name) IN (${LANGS.map((l) => `"${l}"`).join(',')}))
    }`,
    { timeoutMs: 60_000 }
  )) as { club: { value: string }; name: { value: string } }[]

  const pool = new Map<string, ClubCandidate>()
  for (const b of bindings) {
    const qid = qidFromUri(b.club.value)
    if (qid) addName(pool, qid, b.name.value)
  }
  return pool
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const teams = (await loadTeams())
    .map((t) => ({ ...t, competitions: t.comps.split(',').filter((c) => !SKIP.has(c)) }))
    .filter((t) => t.competitions.length > 0)

  const leagues = await leagueCandidates()
  const matched = new Map<number, { qid: string; how: string }>()
  for (const t of teams) {
    if (OVERRIDES[t.id]) {
      matched.set(t.id, { qid: OVERRIDES[t.id], how: 'override' })
      continue
    }
    const pool = t.competitions.flatMap((c) => [...(leagues.get(c)?.values() ?? [])])
    const hit = matchClub({ name: t.name, shortName: t.short_name }, pool)
    if (hit) matched.set(t.id, { qid: hit.qid, how: `league:${hit.score}` })
  }

  const rest = teams.filter((t) => !matched.has(t.id))
  if (rest.length > 0) {
    await pause(2_000) // be polite to WDQS between the two queries
    const pool = [...(await labelCandidates(rest.flatMap((t) => [t.name, t.short_name ?? t.name]))).values()]
    for (const t of rest) {
      const hit = matchClub({ name: t.name, shortName: t.short_name }, pool)
      if (hit) matched.set(t.id, { qid: hit.qid, how: `label:${hit.score}` })
    }
  }

  // One item claimed by two of our teams means one of them is wrong.
  const owners = new Map<string, number[]>()
  for (const [id, m] of matched) owners.set(m.qid, [...(owners.get(m.qid) ?? []), id])
  for (const [qid, ids] of owners) {
    if (ids.length > 1) {
      console.warn(`! ${qid} claimed by teams ${ids.join(', ')} - dropping all of them`)
      for (const id of ids) matched.delete(id)
    }
  }

  for (const t of teams) {
    const m = matched.get(t.id)
    console.log(`${String(t.id).padStart(6)}  ${(m?.qid ?? '-').padEnd(10)} ${(m?.how ?? 'UNMATCHED').padEnd(9)} ${t.competitions.join(',').padEnd(7)} ${t.name}`)
  }
  const missing = teams.filter((t) => !matched.has(t.id))
  console.log(`\n${matched.size}/${teams.length} matched; unmatched: ${missing.map((t) => `${t.id} ${t.name}`).join('; ') || 'none'}`)
  if (dryRun) return

  const entries = teams
    .filter((t) => matched.has(t.id))
    .map(
      (t) =>
        `  { teamId: ${t.id}, qid: '${matched.get(t.id)!.qid}', competitions: [${t.competitions.map((c) => `'${c}'`).join(', ')}] }, // ${t.name.replace(/\*\//g, '')}`
    )
  const file = `/**
 * Our clubs -> Wikidata items. GENERATED by scripts/wikidata-club-qids.ts on
 * ${new Date().toISOString().slice(0, 10)}, then reviewed. Edit the script's OVERRIDES rather than
 * this file, or the next run will undo the fix.
 *
 * National teams (WC, EC) are left out: they do not sign players.
${missing.length ? ` * Unmatched: ${missing.map((t) => `${t.id} ${t.name}`).join('; ')}.\n` : ''} */

export interface ClubQid {
  /** football-data team id, i.e. teams.id and /team/<id>. */
  teamId: number
  qid: string
  /** Club competitions (football-data codes) the team plays in this season. */
  competitions: string[]
}

export const CLUB_QIDS: readonly ClubQid[] = [
${entries.join('\n')}
]
`
  const out = path.join(process.cwd(), 'lib', 'transfers', 'club-qids.ts')
  writeFileSync(out, file)
  console.log(`wrote ${out}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
