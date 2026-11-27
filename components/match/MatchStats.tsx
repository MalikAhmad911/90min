import type { MatchDetail, MatchDetailsExtras, MatchStatLine, TeamStatistics } from '@/lib/types'
import { DetailsAttribution } from './DetailsAttribution'

interface StatRow {
  label: string
  key: keyof TeamStatistics
  /** Rendered as "62%" rather than "62". */
  percent?: boolean
}

/** football-data's per-team statistics (paid plans only), kept as a fallback. */
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

type MatchWithStats = MatchDetail & Pick<MatchDetailsExtras, 'statistics' | 'detailsSource'>

/** Legacy rows mapped into the provider-neutral line shape. */
function legacyLines(match: MatchDetail): MatchStatLine[] {
  const home = match.homeTeam.statistics
  const away = match.awayTeam.statistics
  return ROWS.filter(
    (row) => typeof home?.[row.key] === 'number' || typeof away?.[row.key] === 'number'
  ).map((row) => ({
    key: 'possession',
    label: row.label,
    home: home?.[row.key] ?? 0,
    away: away?.[row.key] ?? 0,
    format: row.percent ? 'percent' : 'count',
  }))
}

export function formatStat(value: number, format: MatchStatLine['format']): string {
  if (format === 'percent') return `${Math.round(value)}%`
  if (format === 'decimal') return value.toFixed(2)
  return String(Math.round(value))
}

/** Whether the Stats tab has anything to show. */
export function hasStatistics(match: MatchWithStats): boolean {
  return (match.statistics?.length ?? 0) > 0 || legacyLines(match).length > 0
}

function Bar({ home, away }: { home: number; away: number }) {
  const total = home + away
  // A 50/50 split is the honest default when neither side recorded anything.
  const homePct = total > 0 ? (home / total) * 100 : 50

  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-bg-elevated" aria-hidden="true">
      <div className="bg-accent-green" style={{ width: `${homePct}%` }} />
      <div className="bg-content-muted" style={{ width: `${100 - homePct}%` }} />
    </div>
  )
}

export function MatchStats({ match }: { match: MatchWithStats }) {
  const lines = match.statistics?.length ? match.statistics : legacyLines(match)

  if (lines.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[13px] text-content-secondary font-medium">No statistics available</p>
        <p className="text-[11px] text-content-muted mt-1">
          Match statistics are not published for every competition on this plan.
        </p>
      </div>
    )
  }

  const homeName = match.homeTeam.shortName || match.homeTeam.name
  const awayName = match.awayTeam.shortName || match.awayTeam.name

  return (
    <div>
      <ul className="px-4 py-3 flex flex-col gap-3" aria-label="Match statistics">
        {lines.map((line, i) => {
          const h = formatStat(line.home, line.format)
          const a = formatStat(line.away, line.format)
          const highlight = line.key === 'xg' && match.statistics?.length
          return (
            <li
              key={`${line.label}-${i}`}
              className="flex flex-col gap-1"
              aria-label={`${line.label}: ${homeName} ${h}, ${awayName} ${a}`}
            >
              <div className="flex items-center justify-between text-[12px]" aria-hidden="true">
                <span className="font-semibold text-content-primary tabular-nums">{h}</span>
                <span className={highlight ? 'text-content-secondary font-medium' : 'text-content-muted'}>
                  {line.label}
                </span>
                <span className="font-semibold text-content-primary tabular-nums">{a}</span>
              </div>
              <Bar home={line.home} away={line.away} />
            </li>
          )
        })}
      </ul>
      <DetailsAttribution source={match.statistics?.length ? match.detailsSource : null} />
    </div>
  )
}
