import { z } from 'zod'

/**
 * Wikidata lookups for player enrichment (height, Q-id).
 *
 * Wikidata's statements are CC0, so a height taken from here needs no
 * attribution. Its images (P18) are a different matter - every Commons file
 * carries its own licence, often CC BY-SA - so this module deliberately never
 * asks for them.
 *
 * Matching is by name AND date of birth. Names alone are hopeless: a label
 * query for "Mohamed Salah" returns three footballers born in 1983, 1992 and
 * 1994, and "Rodrigo" returns five.
 */

const ENDPOINT = 'https://query.wikidata.org/sparql'
/** Wikidata asks automated clients to identify themselves; no personal data. */
export const USER_AGENT = '90MinTactics/1.0 (football scores app)'
/** Q937857 = association football player. Narrows label hits to footballers. */
const FOOTBALLER = 'Q937857'

export interface WikidataCandidate {
  qid: string
  label: string
  /** YYYY-MM-DD */
  dateOfBirth: string
  heightCm: number | null
}

/** Case-, accent- and punctuation-insensitive form of a name, for comparison. */
export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Wikidata's normalised height is in metres. Values outside the range the
 * players table accepts (120-230 cm) are data errors and are dropped rather
 * than allowed to fail the whole update.
 */
export function heightCmFromMetres(metres: number | null | undefined): number | null {
  if (metres == null || !Number.isFinite(metres)) return null
  const cm = Math.round(metres * 100)
  return cm >= 120 && cm <= 230 ? cm : null
}

/**
 * The one candidate that is this player, or null.
 *
 * Requires the same date of birth and the same normalised name. When two
 * distinct items still qualify (a duplicate item on Wikidata) we refuse to
 * guess - a wrong height on a real person's page is worse than none.
 */
export function matchCandidate(
  player: { name: string; dateOfBirth: string | null },
  candidates: WikidataCandidate[],
  options: { requireName?: boolean } = {}
): WikidataCandidate | null {
  if (!player.dateOfBirth) return null
  const dob = player.dateOfBirth.slice(0, 10)
  const name = normaliseName(player.name)
  const requireName = options.requireName ?? true

  const hits = candidates.filter(
    (c) => c.dateOfBirth === dob && (!requireName || normaliseName(c.label) === name)
  )
  const qids = new Set(hits.map((h) => h.qid))
  if (qids.size !== 1) return null

  // Several rows for one item (e.g. two height statements): prefer one with a height.
  return hits.find((h) => h.heightCm != null) ?? hits[0]
}

/** A SPARQL string literal. Backslash and quote are the only characters that need escaping. */
function literal(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`
}

const QID = /^Q\d+$/

const bindingSchema = z.object({
  item: z.object({ value: z.string() }),
  label: z.object({ value: z.string() }),
  dob: z.object({ value: z.string() }),
  height: z.object({ value: z.string() }).optional(),
})

const responseSchema = z.object({
  results: z.object({ bindings: z.array(z.unknown()) }),
})

async function runQuery(query: string): Promise<WikidataCandidate[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Wikidata responded ${res.status}`)

  const parsed = responseSchema.parse(await res.json())
  const out: WikidataCandidate[] = []
  for (const raw of parsed.results.bindings) {
    const b = bindingSchema.safeParse(raw)
    if (!b.success) continue
    const qid = b.data.item.value.split('/').pop() ?? ''
    if (!QID.test(qid)) continue
    out.push({
      qid,
      label: b.data.label.value,
      dateOfBirth: b.data.dob.value.slice(0, 10),
      heightCm: heightCmFromMetres(b.data.height ? Number(b.data.height.value) : null),
    })
  }
  return out
}

/** Footballers whose English label or alias is one of `names`. One request for the batch. */
export async function findFootballersByName(names: string[]): Promise<WikidataCandidate[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (unique.length === 0) return []
  const values = unique.map((n) => `${literal(n)}@en`).join(' ')
  return runQuery(`
    SELECT ?item ?label ?dob ?height WHERE {
      VALUES ?label { ${values} }
      ?item rdfs:label|skos:altLabel ?label ;
            wdt:P106 wd:${FOOTBALLER} ;
            wdt:P569 ?dob .
      OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?height }
    }`)
}

/** Items by Q-id, e.g. ids TheSportsDB links to. One request for the batch. */
export async function findByQids(qids: string[]): Promise<WikidataCandidate[]> {
  const valid = [...new Set(qids.filter((q) => QID.test(q)))]
  if (valid.length === 0) return []
  return runQuery(`
    SELECT ?item ?label ?dob ?height WHERE {
      VALUES ?item { ${valid.map((q) => `wd:${q}`).join(' ')} }
      ?item wdt:P569 ?dob ;
            rdfs:label ?label .
      FILTER(LANG(?label) = "en")
      OPTIONAL { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?height }
    }`)
}
