import type { MatchDetail, TeamStatistics } from '@/lib/types'

interface StatRow {
  label: string
  key: keyof TeamStatistics
  /** Rendered as "62%" rather than "62". */
  percent?: boolean
}

const ROWS: StatRow[] = [
  { label: 'Possession', key: 'ball_possession', percent: true },
  { label: 'Shots', key: 'shots' },
  { label: 'Shots on target', key: 'shots_on_goal' },
  { label: 'Shots off target', key: 'shots_off_goal' },
  { label: 'Corners', key: 'corner_kicks' },
  { label: 'Offsides', key: 'offsides' },
  { label: 'Fouls', key: 'fouls' },
  { label: 'Saves', key: 'saves' },
  { label: 'Yellow cards', key: 'yellow_cards' },
  { label: 'Red cards', key: 'red_cards' },
]

function Bar({ home, away }: { home: number; away: number }) {
  const total = home + away
  // A 50/50 split is the honest default when neither side recorded anything.
  const homePct = total > 0 ? (home / total) * 100 : 50

  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-bg-elevated">
      <div className="bg-accent-green" style={{ width: `${homePct}%` }} />
      <div className="bg-content-muted" style={{ width: `${100 - homePct}%` }} />
    </div>
  )
}

export function MatchStats({ match }: { match: MatchDetail }) {
  const home = match.homeTeam.statistics
  const away = match.awayTeam.statistics

  const available = ROWS.filter(
    (row) => typeof home?.[row.key] === 'number' || typeof away?.[row.key] === 'number'
  )

  if (available.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[13px] text-content-secondary font-medium">No statistics available</p>
        <p className="text-[11px] text-content-muted mt-1">
          Match statistics are not published for every competition on this plan.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {available.map((row) => {
        const h = home?.[row.key] ?? 0
        const a = away?.[row.key] ?? 0
        const suffix = row.percent ? '%' : ''

        return (
          <div key={row.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-content-primary tabular-nums">
                {h}
                {suffix}
              </span>
              <span className="text-content-muted">{row.label}</span>
              <span className="font-semibold text-content-primary tabular-nums">
                {a}
                {suffix}
              </span>
            </div>
            <Bar home={h} away={a} />
          </div>
        )
      })}
    </div>
  )
}
