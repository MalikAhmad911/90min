import { getStandings } from './queries'
import { getFinishedLeagueMatches } from './league-queries'
import { buildStandingsView, type StandingsView } from '@/lib/standings-splits'
import type { StandingsTable } from '@/lib/types'

/**
 * The standings for one view (PRD LG-1), shared by /api/standings and the
 * server-rendered league page so both hand the client the same table.
 *
 * - total: the stored table(s), with form computed from our results wherever
 *   the provider left it null. If that extra read fails the table is still
 *   returned without form - the form guide is never worth losing the table.
 * - home / away: computed from our results (or the provider's own split
 *   tables, when it sends them).
 *
 * An empty array means "no table stored yet", exactly as getStandings does.
 */
export async function getStandingsView(
  code: string,
  view: StandingsView = 'total'
): Promise<StandingsTable[]> {
  const tables = await getStandings(code)
  if (tables.length === 0) return tables

  if (view === 'total') {
    const needsForm = tables.some((t) => t.type === 'TOTAL' && t.table.some((r) => !r.form))
    if (!needsForm) return tables
    try {
      return buildStandingsView(tables, await getFinishedLeagueMatches(code), 'total')
    } catch (err) {
      console.error(`[standings] form for ${code} could not be computed:`, err)
      return tables
    }
  }

  return buildStandingsView(tables, await getFinishedLeagueMatches(code), view)
}
