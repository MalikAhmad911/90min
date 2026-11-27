import type { Metadata } from 'next'
import { inArray } from 'drizzle-orm'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import { getDb, isDatabaseConfigured } from '@/lib/db'
import { teams } from '@/lib/db/schema'
import { getRecentTransfers } from '@/lib/transfers/recent'
import { TransfersView, type TransferRow } from '@/components/transfers/TransfersView'

export const revalidate = 21600

const TITLE = 'Football Transfers – Latest Moves | 90 Min Tactics'
const DESCRIPTION =
  'The latest confirmed signings and loans for Premier League, LaLiga, Bundesliga, Serie A, Ligue 1 and more clubs.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/transfers' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/transfers' },
}

type TeamInfo = { id: number; name: string; shortName: string | null; crest: string | null }

async function loadTeams(ids: number[]): Promise<Map<number, TeamInfo>> {
  if (ids.length === 0 || !isDatabaseConfigured()) return new Map()
  try {
    const rows = await getDb()
      .select({ id: teams.id, name: teams.name, shortName: teams.shortName, crest: teams.crest })
      .from(teams)
      .where(inArray(teams.id, ids))
    return new Map(rows.map((r) => [r.id, r]))
  } catch {
    return new Map()
  }
}

// Static and revalidated in the background: the Wikidata query can take
// ~20 s, longer than a serverless request may run, so it never happens while
// a visitor waits. Filtering happens in the browser.
export default async function TransfersPage() {
  const all = (await getRecentTransfers()).slice(0, 200)
  const teamIds = [...new Set(all.flatMap((t) => [t.toTeamId, t.fromTeamId ?? -1]).filter((id) => id > 0))]
  const teamMap = await loadTeams(teamIds)

  const rows: TransferRow[] = all.map((t) => {
    const to = teamMap.get(t.toTeamId)
    const from = t.fromTeamId ? teamMap.get(t.fromTeamId) : undefined
    return {
      key: `${t.playerQid}-${t.toTeamId}-${t.date}`,
      playerName: t.playerName,
      date: t.date,
      loan: t.loan,
      competitions: t.toCompetitions,
      to: { id: t.toTeamId, name: to ? to.shortName || to.name : 'Club', crest: to?.crest ?? null },
      from: t.fromName
        ? { id: from?.id ?? null, name: from ? from.shortName || from.name : t.fromName }
        : null,
    }
  })
  const codes = new Set(rows.flatMap((r) => r.competitions))
  const chips = FREE_COMPETITIONS.filter((c) => codes.has(c.code)).map((c) => ({
    code: c.code,
    name: c.name,
    emblem: c.emblem,
  }))

  return <TransfersView rows={rows} chips={chips} />
}
