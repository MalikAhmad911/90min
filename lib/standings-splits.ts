/**
 * Form and home/away tables computed from our own results (PRD LG-1).
 *
 * football-data's free tier returns only the TOTAL table, and with
 * `form: null`. Every finished match of the season is already in the
 * `matches` table, so both are derived here instead.
 *
 * Pure and dependency-free: the database read lives in
 * lib/db/league-queries.ts (getFinishedLeagueMatches), the wiring in
 * lib/db/standings-view.ts, and the client imports the types only.
 *
 * Form strings produced here run oldest to newest - the most recent result is
 * LAST, i.e. the right-most pill, as FotMob draws it.
 */

import type { StandingRow, StandingsTable, Team } from './types'

export type FormResult = 'W' | 'D' | 'L'

export const STANDINGS_VIEWS = ['total', 'home', 'away'] as const
export type StandingsView = (typeof STANDINGS_VIEWS)[number]

/** How many results the form guide shows. */
export const FORM_LENGTH = 5

/** One finished (or awarded) match with a full-time score. */
export interface FinishedMatch {
  id: number
  /** ISO timestamp; orders the form guide. */
  utcDate: string
  stage: string | null
  homeTeam: Team
  awayTeam: Team
  homeGoals: number
  awayGoals: number
}

/** W/D/L for the side that scored `goalsFor`. */
export function resultFor(goalsFor: number, goalsAgainst: number): FormResult {
  return goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D'
}

/** Kick-off order, then id, so two matches at the same minute stay stable. */
function chronological(a: FinishedMatch, b: FinishedMatch): number {
  return Date.parse(a.utcDate) - Date.parse(b.utcDate) || a.id - b.id
}

/**
 * A team's last `n` results, oldest first (most recent last). `venue` limits
 * it to home or away games. Fewer than `n` games gives a shorter list.
 */
export function computeForm(
  matches: FinishedMatch[],
  teamId: number,
  { n = FORM_LENGTH, venue }: { n?: number; venue?: 'home' | 'away' } = {}
): FormResult[] {
  const results: FormResult[] = []
  for (const m of [...matches].sort(chronological)) {
    const isHome = m.homeTeam.id === teamId
    const isAway = m.awayTeam.id === teamId
    if (!isHome && !isAway) continue
    if (venue === 'home' && !isHome) continue
    if (venue === 'away' && !isAway) continue
    results.push(isHome ? resultFor(m.homeGoals, m.awayGoals) : resultFor(m.awayGoals, m.homeGoals))
  }
  return results.slice(-n)
}

/** "W,D,L" - the StandingRow.form format. Null for a team with no games yet. */
export function formString(results: FormResult[]): string | null {
  return results.length > 0 ? results.join(',') : null
}

/** Table order: points, goal difference, goals scored, then name A-Z. */
export function compareStandingRows(a: StandingRow, b: StandingRow): number {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.team.name.localeCompare(b.team.name)
  )
}

function emptyRow(team: Team): StandingRow {
  return {
    position: 0,
    team,
    playedGames: 0,
    form: null,
    won: 0,
    draw: 0,
    lost: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  }
}

/**
 * A home-only or away-only league table.
 *
 * `seedTeams` puts every team of the league on the table even before it has
 * played at that venue (P 0). Each row's `form` is its last five results at
 * that venue.
 */
export function computeVenueTable(
  matches: FinishedMatch[],
  venue: 'home' | 'away',
  seedTeams: Team[] = []
): StandingRow[] {
  const rows = new Map<number, StandingRow>()
  for (const team of seedTeams) rows.set(team.id, emptyRow(team))

  for (const m of matches) {
    const team = venue === 'home' ? m.homeTeam : m.awayTeam
    const scored = venue === 'home' ? m.homeGoals : m.awayGoals
    const conceded = venue === 'home' ? m.awayGoals : m.homeGoals

    let row = rows.get(team.id)
    if (!row) {
      row = emptyRow(team)
      rows.set(team.id, row)
    }
    row.playedGames += 1
    row.goalsFor += scored
    row.goalsAgainst += conceded
    const result = resultFor(scored, conceded)
    if (result === 'W') row.won += 1
    else if (result === 'D') row.draw += 1
    else row.lost += 1
  }

  const table = [...rows.values()].map((row) => ({
    ...row,
    points: row.won * 3 + row.draw,
    goalDifference: row.goalsFor - row.goalsAgainst,
    form: formString(computeForm(matches, row.team.id, { venue })),
  }))
  table.sort(compareStandingRows)
  return table.map((row, i) => ({ ...row, position: i + 1 }))
}

/**
 * The matches that belong to one stored table: same stage, both teams in it.
 *
 * Matching on the table's own teams is what keeps a cup's group tables apart
 * (and keeps play-off or knockout ties out of a league stage) without relying
 * on the provider spelling group names the same way in both feeds - the
 * Premier League table, for one, comes back with `group: "Matchday"`.
 */
export function matchesForTable(table: StandingsTable, matches: FinishedMatch[]): FinishedMatch[] {
  const ids = new Set(table.table.map((r) => r.team.id))
  return matches.filter(
    (m) =>
      (!table.stage || !m.stage || m.stage === table.stage) &&
      ids.has(m.homeTeam.id) &&
      ids.has(m.awayTeam.id)
  )
}

const VIEW_TYPE: Record<StandingsView, string> = { total: 'TOTAL', home: 'HOME', away: 'AWAY' }

/**
 * The tables for one view of the standings.
 *
 * - total: every stored table unchanged, except that TOTAL rows whose form
 *   the provider left null get one computed from `matches`.
 * - home / away: the provider's own HOME/AWAY tables when it sent any (paid
 *   tiers do); otherwise one computed table per stored TOTAL table.
 */
export function buildStandingsView(
  tables: StandingsTable[],
  matches: FinishedMatch[],
  view: StandingsView
): StandingsTable[] {
  const totals = tables.filter((t) => t.type === VIEW_TYPE.total)

  if (view === 'total') {
    return tables.map((t) => {
      if (t.type !== VIEW_TYPE.total || t.table.every((r) => r.form)) return t
      const own = matchesForTable(t, matches)
      return {
        ...t,
        table: t.table.map((r) => (r.form ? r : { ...r, form: formString(computeForm(own, r.team.id)) })),
      }
    })
  }

  const type = VIEW_TYPE[view]
  const provided = tables.filter((t) => t.type === type)
  if (provided.length > 0) return provided

  return totals.map((t) => ({
    stage: t.stage,
    type,
    group: t.group,
    table: computeVenueTable(
      matchesForTable(t, matches),
      view,
      t.table.map((r) => r.team)
    ),
  }))
}
