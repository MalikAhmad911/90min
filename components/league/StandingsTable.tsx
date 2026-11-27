'use client'

import Link from 'next/link'
import { TeamCrest } from '@/components/ui/TeamCrest'
import type { StandingsTable as StandingsTableType, StandingRow } from '@/lib/types'
import { ZONE_MARKERS, zoneFor, zonesInTable, type ZoneRule, type ZoneTone } from '@/lib/league-zones'

/**
 * Colours per zone tone. Kept here rather than in lib/league-zones.ts because
 * Tailwind only scans app/ and components/ for class names. Every tone also
 * has a marker glyph (ZONE_MARKERS) and the zone name goes into the row's
 * accessible name, so a zone never depends on colour alone (WCAG 1.4.1).
 */
const TONE_CLASSES: Record<ZoneTone, { bar: string; text: string }> = {
  ucl: { bar: 'bg-blue-500', text: 'text-blue-400' },
  'ucl-qual': { bar: 'bg-sky-400', text: 'text-sky-300' },
  uel: { bar: 'bg-orange-500', text: 'text-orange-400' },
  uecl: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
  promotion: { bar: 'bg-accent-green-dim', text: 'text-accent-green-dim' },
  playoff: { bar: 'bg-amber-400', text: 'text-amber-300' },
  'relegation-playoff': { bar: 'bg-orange-300', text: 'text-orange-300' },
  relegation: { bar: 'bg-live-red', text: 'text-live-red' },
  advance: { bar: 'bg-accent-green-dim', text: 'text-accent-green-dim' },
  maybe: { bar: 'bg-amber-400', text: 'text-amber-300' },
  eliminated: { bar: 'bg-content-muted', text: 'text-content-muted' },
}

/**
 * Column layouts. Hidden cells (display: none) take no grid track, so each
 * breakpoint lists exactly the columns it shows:
 *   base:   #  Team  P  GD  Pts
 *   400px+: #  Team  P  GD  Pts  Form   (5 pills need ~5rem; at 360px the
 *                                        team name would be squeezed to nothing)
 *   sm+:    #  Team  P  W  D  L  GD  Pts  [Form]
 */
const GRID_BASE = 'grid items-center gap-1'
const COLS_NO_FORM =
  'grid-cols-[2rem_1fr_1.5rem_2rem_2rem] sm:grid-cols-[2rem_1fr_1.5rem_1.5rem_1.5rem_1.5rem_2rem_2rem]'
const COLS_FORM =
  'grid-cols-[2rem_1fr_1.5rem_2rem_2rem] min-[400px]:grid-cols-[2rem_1fr_1.5rem_2rem_2rem_5rem] sm:grid-cols-[2rem_1fr_1.5rem_1.5rem_1.5rem_1.5rem_2rem_2rem_5rem]'
const FORM_CELL = 'hidden min-[400px]:block'

const FORM_WORD: Record<string, string> = { W: 'win', D: 'draw', L: 'loss' }

/**
 * Last five results as coloured pills, oldest to newest - the most recent is
 * on the right. Each pill carries its letter too, so the result never
 * depends on colour alone.
 */
function Form({ form }: { form: string | null }) {
  if (!form) return <span className="block text-right text-content-muted text-[11px]">-</span>

  const results = form
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(-5)
  const colour = (r: string) =>
    r === 'W'
      ? 'bg-accent-green text-bg-primary'
      : r === 'L'
        ? 'bg-live-red text-white'
        : 'bg-content-muted text-content-primary'

  return (
    <span
      className="flex items-center gap-0.5 justify-end"
      title={`Last ${results.length}, most recent last`}
    >
      <span className="sr-only">
        Form, oldest to newest: {results.map((r) => FORM_WORD[r] ?? r).join(', ')}
      </span>
      {results.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-black ${colour(r)}`}
        >
          {r}
        </span>
      ))}
    </span>
  )
}

function Row({
  row,
  showForm,
  zone,
  grid,
}: {
  row: StandingRow
  showForm: boolean
  zone: ZoneRule | null
  grid: string
}) {
  const name = row.team.shortName || row.team.name
  return (
    <Link
      href={`/team/${row.team.id}`}
      // With a zone, the accessible name carries it, so it is announced as
      // well as shown.
      aria-label={zone ? `${row.position}. ${name}, ${row.points} points, ${zone.label}` : undefined}
      title={zone?.label}
      className={`relative ${grid} px-3 py-2 hover:bg-bg-elevated transition-colors`}
    >
      {zone && (
        <span
          aria-hidden="true"
          className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r ${TONE_CLASSES[zone.tone].bar}`}
        />
      )}
      <span className="flex items-center gap-1">
        <span className="text-[11px] text-content-muted tabular-nums w-4">{row.position}</span>
        {zone && (
          <span aria-hidden="true" className={`text-[9px] leading-none ${TONE_CLASSES[zone.tone].text}`}>
            {ZONE_MARKERS[zone.tone]}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 min-w-0">
        <TeamCrest src={row.team.crest} name={row.team.name} size={16} />
        <span className="text-[12px] text-content-primary truncate">{name}</span>
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
        <span className={FORM_CELL}>
          <Form form={row.form} />
        </span>
      )}
    </Link>
  )
}

/** Legend under the table: colour, marker and the zone's name together. */
function ZoneLegend({ zones }: { zones: ZoneRule[] }) {
  if (zones.length === 0) return null
  return (
    <div className="px-3 py-2 border-t border-divider">
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Table zones">
        {zones.map((z) => (
          <li
            key={`${z.tone}-${z.label}`}
            className="flex items-center gap-1.5 text-[10px] text-content-secondary"
          >
            <span aria-hidden="true" className={`inline-block w-[3px] h-3 rounded-sm ${TONE_CLASSES[z.tone].bar}`} />
            <span aria-hidden="true" className={TONE_CLASSES[z.tone].text}>
              {ZONE_MARKERS[z.tone]}
            </span>
            {z.label}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[9px] text-content-muted">
        Usual allocation for this season - cup results and reallocations can move places.
      </p>
    </div>
  )
}

/**
 * `showGroup` exists because football-data puts a group name on league tables
 * too - the Premier League comes back with `group: "Matchday"`, which is not a
 * group and means nothing to a reader. So the heading is only drawn when the
 * competition genuinely has more than one table, i.e. a cup group stage.
 *
 * `competitionCode` switches on qualification / relegation zones (PRD LG-2),
 * configured in lib/league-zones.ts. Zones apply to overall tables only: a
 * home-only or away-only table (type HOME / AWAY) qualifies nobody.
 *
 * The Form column appears when any row has a form string - the provider's,
 * or the one /api/standings computes from our results (lib/standings-splits.ts).
 */
export function StandingsTable({
  table,
  showGroup = false,
  competitionCode,
}: {
  table: StandingsTableType
  showGroup?: boolean
  competitionCode?: string
}) {
  const rows = table.table ?? []
  if (rows.length === 0) return null

  const showForm = rows.some((r) => r.form)
  const grid = `${GRID_BASE} ${showForm ? COLS_FORM : COLS_NO_FORM}`
  const zoned = competitionCode && (!table.type || table.type === 'TOTAL') ? competitionCode : null
  const size = rows.length
  const legend = zonesInTable(zoned, size)

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
      <div className={`${grid} px-3 py-1.5 border-b border-divider`}>
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
          <span className={`text-[10px] font-bold uppercase text-content-muted text-right ${FORM_CELL}`}>
            Form
          </span>
        )}
      </div>

      <div className="divide-y divide-divider">
        {rows.map((row) => (
          <Row
            key={`${row.position}-${row.team.id}`}
            row={row}
            showForm={showForm}
            zone={zoneFor(zoned, row.position, size)}
            grid={grid}
          />
        ))}
      </div>

      <ZoneLegend zones={legend} />
    </div>
  )
}
