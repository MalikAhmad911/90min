import type { MatchDetail, MatchGoal } from '@/lib/types'
import type { MatchEventsExtras } from '@/lib/db/event-queries'
import { formatMinute } from './MatchEvents'

/**
 * Scorers under each team in the match header (PRD MC-1), FotMob-style:
 * one line per scorer with all their minutes, "(P)" for penalties and
 * "(OG)" for own goals. An own goal sits under the side it counted for.
 * Disallowed goals are left out - the timeline shows those, struck through.
 *
 * Renders nothing when there is nothing to list, so it can be placed
 * unconditionally.
 */

type Goal = MatchGoal & { cancelled?: boolean }

export interface ScorerLine {
  name: string
  /** e.g. ["21′", "90+2′ (P)"] in playing order. */
  marks: string[]
}

function mark(goal: Goal): string {
  const suffix = goal.type === 'PENALTY' ? ' (P)' : goal.type === 'OWN' ? ' (OG)' : ''
  return `${formatMinute(goal.minute, goal.injuryTime)}${suffix}`
}

/** Groups a side's goals by scorer, ordered by each scorer's first goal. */
export function scorerLines(goals: Goal[], teamId: number): ScorerLine[] {
  const lines = new Map<string, ScorerLine>()
  const ordered = goals
    .filter((g) => !g.cancelled && g.team.id === teamId)
    .sort((a, b) => a.minute - b.minute || (a.injuryTime ?? 0) - (b.injuryTime ?? 0))
  for (const g of ordered) {
    const name = g.scorer.name || 'Unknown scorer'
    const line = lines.get(name) ?? { name, marks: [] }
    line.marks.push(mark(g))
    lines.set(name, line)
  }
  return [...lines.values()]
}

function Column({ lines, align, label }: { lines: ScorerLine[]; align: 'left' | 'right'; label: string }) {
  return (
    <ul aria-label={label} className={`flex-1 min-w-0 space-y-0.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {lines.map((l) => (
        <li key={l.name} className="text-[11px] text-content-secondary truncate">
          <span className="text-content-primary">{l.name}</span>{' '}
          <span className="tabular-nums text-content-muted">{l.marks.join(', ')}</span>
        </li>
      ))}
    </ul>
  )
}

export function ScorersSummary({
  match,
}: {
  match: Pick<MatchDetail, 'homeTeam' | 'awayTeam'> & { goals?: MatchEventsExtras['goals'] | MatchDetail['goals'] }
}) {
  const goals = (match.goals ?? []) as Goal[]
  const home = scorerLines(goals, match.homeTeam.id)
  const away = scorerLines(goals, match.awayTeam.id)
  if (home.length === 0 && away.length === 0) return null

  const homeName = match.homeTeam.shortName || match.homeTeam.name
  const awayName = match.awayTeam.shortName || match.awayTeam.name

  return (
    <div className="flex items-start gap-3 mt-3 px-1">
      <Column lines={home} align="right" label={`${homeName} scorers`} />
      <span aria-hidden="true" className="shrink-0 text-[11px] leading-4 text-content-muted">
        &#9917;
      </span>
      <Column lines={away} align="left" label={`${awayName} scorers`} />
    </div>
  )
}
