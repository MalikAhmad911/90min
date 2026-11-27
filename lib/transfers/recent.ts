import { qidFromUri, sparqlSelect } from '@/lib/providers/wikidata'
import { CLUB_QIDS } from './club-qids'

/**
 * Recent moves into our clubs, from Wikidata (CC0).
 *
 * A "transfer" here is a "member of sports team" (P54) statement on a
 * footballer whose start time (P580) is recent and whose club is one of ours.
 * The previous club is the player's P54 statement that ended closest before
 * that start. Wikidata is edited by volunteers, so it can lag real news by
 * hours or days; the page says so.
 */

export const TRANSFERS_REVALIDATE_SECONDS = 6 * 60 * 60

export interface Transfer {
  playerQid: string
  playerName: string
  date: string // YYYY-MM-DD
  toTeamId: number
  toCompetitions: string[]
  fromQid: string | null
  fromName: string | null
  /** football-data id of the previous club when it is one of ours. */
  fromTeamId: number | null
  loan: boolean
}

export interface RawRow {
  player: string
  playerName: string
  club: string
  start: string
  prev?: string
  prevName?: string
  prevEnd?: string
  acqName?: string
}

const TEAM_BY_QID = new Map(CLUB_QIDS.map((c) => [c.qid, c]))

/** Pure: SPARQL rows -> one transfer per (player, club, date), newest first. */
export function buildTransfers(rows: RawRow[]): Transfer[] {
  const byKey = new Map<string, { t: Transfer; prevEnd: number }>()

  for (const r of rows) {
    const playerQid = qidFromUri(r.player)
    const clubQid = qidFromUri(r.club)
    const club = clubQid ? TEAM_BY_QID.get(clubQid) : undefined
    const startMs = Date.parse(r.start)
    if (!playerQid || !club || !Number.isFinite(startMs)) continue
    // An unlabelled item shows its Q-id as its "label": not presentable.
    if (!r.playerName || /^Q\d+$/.test(r.playerName)) continue

    const date = new Date(startMs).toISOString().slice(0, 10)
    const key = `${playerQid}|${clubQid}|${date}`
    const loan = /loan|leihe|cesi[oó]n|pr[eê]t|prestito|empr[eé]stimo/i.test(r.acqName ?? '')

    let entry = byKey.get(key)
    if (!entry) {
      entry = {
        t: {
          playerQid,
          playerName: r.playerName,
          date,
          toTeamId: club.teamId,
          toCompetitions: club.competitions,
          fromQid: null,
          fromName: null,
          fromTeamId: null,
          loan,
        },
        prevEnd: -Infinity,
      }
      byKey.set(key, entry)
    }
    if (loan) entry.t.loan = true

    // Previous club: ended on/before the start, the latest such end wins.
    const prevQid = r.prev ? qidFromUri(r.prev) : null
    const prevEnd = r.prevEnd ? Date.parse(r.prevEnd) : NaN
    if (
      prevQid &&
      prevQid !== clubQid &&
      Number.isFinite(prevEnd) &&
      prevEnd <= startMs + 24 * 3600_000 &&
      prevEnd > entry.prevEnd &&
      r.prevName &&
      !/^Q\d+$/.test(r.prevName)
    ) {
      entry.prevEnd = prevEnd
      entry.t.fromQid = prevQid
      entry.t.fromName = r.prevName
      entry.t.fromTeamId = TEAM_BY_QID.get(prevQid)?.teamId ?? null
    }
  }

  return [...byKey.values()]
    .map((e) => e.t)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.playerName.localeCompare(b.playerName)))
}

const str = (b: Record<string, { value?: string } | undefined>, k: string) => b[k]?.value

/** Moves into our clubs that started within the last `days` days (one WDQS query, cached 6h). */
export async function getRecentTransfers(days = 120, now = new Date()): Promise<Transfer[]> {
  if (CLUB_QIDS.length === 0) return []
  const since = new Date(now.getTime() - days * 24 * 3600_000).toISOString().slice(0, 10)
  const until = new Date(now.getTime() + 2 * 24 * 3600_000).toISOString().slice(0, 10)

  const query = `SELECT ?player ?playerName ?club ?start ?prev ?prevName ?prevEnd ?acqName WHERE {
  VALUES ?club { ${CLUB_QIDS.map((c) => `wd:${c.qid}`).join(' ')} }
  ?player p:P54 ?st .
  ?st ps:P54 ?club ; pq:P580 ?start .
  FILTER(?start >= "${since}T00:00:00Z"^^xsd:dateTime && ?start <= "${until}T00:00:00Z"^^xsd:dateTime)
  ?player wdt:P106 wd:Q937857 .
  OPTIONAL { ?st pq:P1642 ?acq . ?acq rdfs:label ?acqName . FILTER(LANG(?acqName) = "en") }
  OPTIONAL {
    ?player p:P54 ?st2 .
    ?st2 ps:P54 ?prev ; pq:P582 ?prevEnd .
    FILTER(?prev != ?club && ?prevEnd <= ?start && ?prevEnd >= "${since}T00:00:00Z"^^xsd:dateTime - "P400D"^^xsd:duration)
    ?prev rdfs:label ?prevName . FILTER(LANG(?prevName) = "en")
  }
  ?player rdfs:label ?playerName . FILTER(LANG(?playerName) = "en")
}
LIMIT 3000`

  try {
    const bindings = (await sparqlSelect(query, {
      revalidate: TRANSFERS_REVALIDATE_SECONDS,
      timeoutMs: 55_000,
    })) as Record<string, { value?: string } | undefined>[]
    const rows: RawRow[] = bindings.map((b) => ({
      player: str(b, 'player') ?? '',
      playerName: str(b, 'playerName') ?? '',
      club: str(b, 'club') ?? '',
      start: str(b, 'start') ?? '',
      prev: str(b, 'prev'),
      prevName: str(b, 'prevName'),
      prevEnd: str(b, 'prevEnd'),
      acqName: str(b, 'acqName'),
    }))
    return buildTransfers(rows)
  } catch {
    return []
  }
}
