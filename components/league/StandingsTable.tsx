'use client'

import Link from 'next/link'
import { TeamCrest } from '@/components/ui/TeamCrest'
import type { StandingsTable as StandingsTableType, StandingRow } from '@/lib/types'

/** Last five results, newest first, as coloured pips. */
function Form({ form }: { form: string | null }) {
  if (!form) return <span className="text-content-muted text-[11px]">-</span>

  const results = form.split(',').slice(0, 5)
  const colour = (r: string) =>
    r === 'W' ? 'bg-accent-green text-bg-primary' : r === 'L' ? 'bg-live-red text-white' : 'bg-bg-elevated text-content-secondary'

  return (
    <span className="flex items-center gap-0.5 justify-end">
      {results.map((r, i) => (
        <span
          key={i}
          className={`w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-black ${colour(r.trim())}`}
        >
          {r.trim()}
        </span>
      ))}
    </span>
  )
}

function Row({ row, showForm }: { row: StandingRow; showForm: boolean }) {
  return (
    <Link
      href={`/team/${row.team.id}`}
      className="grid grid-cols-[1.25rem_1fr_1.5rem_1.5rem_1.5rem_1.5rem_2rem_2rem] sm:grid-cols-[1.25rem_1fr_1.5rem_1.5rem_1.5rem_1.5rem_2rem_2rem_5rem] items-center gap-1 px-3 py-2 hover:bg-bg-elevated transition-colors"
    >
      <span className="text-[11px] text-content-muted tabular-nums">{row.position}</span>
      <span className="flex items-center gap-2 min-w-0">
        <TeamCrest src={row.team.crest} name={row.team.name} size={16} />
        <span className="text-[12px] text-content-primary truncate">
          {row.team.shortName || row.team.name}
        </span>
      </span>
      <span className="text-[11px] text-content-secondary text-center tabular-nums">
        {row.playedGames}
      </span>
      <span className="text-[11px] text-content-muted text-center tabular-nums hidden sm:block">
        {row.won}
      </span>
      <span className="text-[11px] text-content-muted text-center tabular-nums hidden sm:block">
        {row.draw}
      </span>
      <span className="text-[11px] text-content-muted text-center tabular-nums hidden sm:block">
        {row.lost}
      </span>
      <span className="text-[11px] text-content-secondary text-center tabular-nums">
        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
      </span>
      <span className="text-[12px] text-content-primary font-bold text-center tabular-nums">
        {row.points}
      </span>
      {showForm && (
        <span className="hidden sm:block">
          <Form form={row.form} />
        </span>
      )}
    </Link>
  )
}

/**
 * `showGroup` exists because football-data puts a group name on league tables
 * too - the Premier League comes back with `group: "Matchday"`, which is not a
 * group and means nothing to a reader. So the heading is only drawn when the
 * competition genuinely has more than one table, i.e. a cup group stage.
 */
export function StandingsTable({
  table,
  showGroup = false,
}: {
  table: StandingsTableType
  showGroup?: boolean
}) {
  const rows = table.table ?? []
  if (rows.length === 0) return null

  const showForm = rows.some((r) => r.form)

  return (
    <div>
      {showGroup && table.group && (
        <div className="px-3 py-2 bg-bg-elevated/40">
          <span className="text-[12px] font-semibold text-content-secondary">
            {table.group.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-[1.25rem_1fr_1.5rem_1.5rem_1.5rem_1.5rem_2rem_2rem] sm:grid-cols-[1.25rem_1fr_1.5rem_1.5rem_1.5rem_1.5rem_2rem_2rem_5rem] items-center gap-1 px-3 py-1.5 border-b border-divider">
        <span className="text-[10px] font-bold uppercase text-content-muted">#</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">
          Team
        </span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center">PL</span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center hidden sm:block">
          W
        </span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center hidden sm:block">
          D
        </span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center hidden sm:block">
          L
        </span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center">GD</span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center">PTS</span>
        {showForm && (
          <span className="text-[10px] font-bold uppercase text-content-muted text-right hidden sm:block">
            Form
          </span>
        )}
      </div>

      <div className="divide-y divide-divider">
        {rows.map((row) => (
          <Row key={`${row.position}-${row.team.id}`} row={row} showForm={showForm} />
        ))}
      </div>
    </div>
  )
}
