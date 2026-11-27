/**
 * League table zones (PRD LG-2): which positions qualify for what, and which
 * are relegated.
 *
 * REVIEW EVERY SEASON. Allocations change from year to year - UEFA's
 * coefficient ranking moves places between countries, the European
 * Performance Spots can hand a league an extra Champions League place, and
 * domestic cup winners shift the Europa / Conference League places down the
 * table. This file describes the 2026/27 European seasons and the 2026
 * Brasileirão as the default allocation; it cannot know about cup winners or
 * late reallocations, which is why the legend says "qualification" rather
 * than promising a place.
 *
 * Dependency-free so the client StandingsTable can import it.
 */

/** Visual tone; each maps to a colour AND a distinct marker glyph. */
export type ZoneTone =
  | 'ucl'
  | 'ucl-qual'
  | 'uel'
  | 'uecl'
  | 'promotion'
  | 'playoff'
  | 'relegation-playoff'
  | 'relegation'
  | 'advance'
  | 'maybe'
  | 'eliminated'

export interface ZoneRule {
  tone: ZoneTone
  label: string
  /**
   * 1-based positions, inclusive. Negative numbers count from the bottom
   * (-1 = last), so a relegation zone stays right if the league size changes.
   */
  from: number
  to: number
}

/**
 * A visible, non-colour marker per tone - WCAG 1.4.1: colour is never the
 * only signal. Colours live in StandingsTable, because Tailwind only scans
 * app/ and components/ for class names.
 */
export const ZONE_MARKERS: Record<ZoneTone, string> = {
  ucl: '★',
  'ucl-qual': '☆',
  uel: '◆',
  uecl: '◇',
  promotion: '▲',
  playoff: '△',
  'relegation-playoff': '▽',
  relegation: '▼',
  advance: '▲',
  maybe: '△',
  eliminated: '✕',
}

const UCL = 'Champions League'
const UCL_Q = 'Champions League qualifying'
const UEL = 'Europa League'
const UECL = 'Conference League qualifying'
const REL = 'Relegation'
const REL_PO = 'Relegation play-off'

/** Per-competition zones, keyed by football-data code. */
export const LEAGUE_ZONES: Record<string, ZoneRule[]> = {
  PL: [
    { tone: 'ucl', label: UCL, from: 1, to: 4 },
    { tone: 'uel', label: UEL, from: 5, to: 5 },
    { tone: 'uecl', label: UECL, from: 6, to: 6 },
    { tone: 'relegation', label: REL, from: -3, to: -1 },
  ],
  ELC: [
    { tone: 'promotion', label: 'Promotion', from: 1, to: 2 },
    { tone: 'playoff', label: 'Promotion play-offs', from: 3, to: 6 },
    { tone: 'relegation', label: REL, from: -3, to: -1 },
  ],
  PD: [
    { tone: 'ucl', label: UCL, from: 1, to: 4 },
    { tone: 'uel', label: UEL, from: 5, to: 5 },
    { tone: 'uecl', label: UECL, from: 6, to: 6 },
    { tone: 'relegation', label: REL, from: -3, to: -1 },
  ],
  BL1: [
    { tone: 'ucl', label: UCL, from: 1, to: 4 },
    { tone: 'uel', label: UEL, from: 5, to: 5 },
    { tone: 'uecl', label: UECL, from: 6, to: 6 },
    { tone: 'relegation-playoff', label: REL_PO, from: -3, to: -3 },
    { tone: 'relegation', label: REL, from: -2, to: -1 },
  ],
  SA: [
    { tone: 'ucl', label: UCL, from: 1, to: 4 },
    { tone: 'uel', label: UEL, from: 5, to: 5 },
    { tone: 'uecl', label: UECL, from: 6, to: 6 },
    { tone: 'relegation', label: REL, from: -3, to: -1 },
  ],
  FL1: [
    { tone: 'ucl', label: UCL, from: 1, to: 3 },
    { tone: 'ucl-qual', label: UCL_Q, from: 4, to: 4 },
    { tone: 'uel', label: UEL, from: 5, to: 5 },
    { tone: 'uecl', label: UECL, from: 6, to: 6 },
    { tone: 'relegation-playoff', label: REL_PO, from: -3, to: -3 },
    { tone: 'relegation', label: REL, from: -2, to: -1 },
  ],
  DED: [
    { tone: 'ucl', label: UCL, from: 1, to: 1 },
    { tone: 'ucl-qual', label: UCL_Q, from: 2, to: 2 },
    { tone: 'uel', label: UEL, from: 3, to: 3 },
    { tone: 'uecl', label: UECL, from: 4, to: 4 },
    { tone: 'relegation-playoff', label: REL_PO, from: -3, to: -3 },
    { tone: 'relegation', label: REL, from: -2, to: -1 },
  ],
  PPL: [
    { tone: 'ucl', label: UCL, from: 1, to: 1 },
    { tone: 'ucl-qual', label: UCL_Q, from: 2, to: 2 },
    { tone: 'uel', label: UEL, from: 3, to: 3 },
    { tone: 'uecl', label: UECL, from: 4, to: 4 },
    { tone: 'relegation-playoff', label: REL_PO, from: -3, to: -3 },
    { tone: 'relegation', label: REL, from: -2, to: -1 },
  ],
  BSA: [
    { tone: 'ucl', label: 'Copa Libertadores', from: 1, to: 4 },
    { tone: 'ucl-qual', label: 'Copa Libertadores qualifying', from: 5, to: 6 },
    { tone: 'uecl', label: 'Copa Sudamericana', from: 7, to: 12 },
    { tone: 'relegation', label: REL, from: -4, to: -1 },
  ],
  // Champions League league phase (36 teams, format since 2024/25).
  CL: [
    { tone: 'advance', label: 'Round of 16', from: 1, to: 8 },
    { tone: 'playoff', label: 'Knockout play-offs', from: 9, to: 24 },
    { tone: 'eliminated', label: 'Eliminated', from: 25, to: 36 },
  ],
  // Group tables: applied to each group separately.
  WC: [
    { tone: 'advance', label: 'Knockout stage', from: 1, to: 2 },
    { tone: 'maybe', label: 'Best third-placed teams advance', from: 3, to: 3 },
  ],
  EC: [
    { tone: 'advance', label: 'Knockout stage', from: 1, to: 2 },
    { tone: 'maybe', label: 'Best third-placed teams advance', from: 3, to: 3 },
  ],
}

/** Resolves a possibly-negative position against the table size. */
function resolve(pos: number, size: number): number {
  return pos < 0 ? size + pos + 1 : pos
}

/** The zone a position falls in, or null. First matching rule wins. */
export function zoneFor(code: string | null | undefined, position: number, tableSize: number): ZoneRule | null {
  if (!code || !Number.isInteger(position) || position < 1 || tableSize < 1) return null
  const rules = LEAGUE_ZONES[code.toUpperCase()]
  if (!rules) return null
  for (const r of rules) {
    const from = resolve(r.from, tableSize)
    const to = resolve(r.to, tableSize)
    if (position >= from && position <= to) return r
  }
  return null
}

/**
 * The zones that actually appear in a table of this size, in table order -
 * the legend should not list a zone no row is in.
 */
export function zonesInTable(code: string | null | undefined, tableSize: number): ZoneRule[] {
  if (!code) return []
  const rules = LEAGUE_ZONES[code.toUpperCase()] ?? []
  return rules
    .filter((r) => {
      const from = resolve(r.from, tableSize)
      const to = resolve(r.to, tableSize)
      return from >= 1 && to <= tableSize && from <= to
    })
    .sort((a, b) => resolve(a.from, tableSize) - resolve(b.from, tableSize))
}
