import type { Match, GroupedMatches, MatchStatus } from './types'

export function groupByLeague(matches: Match[]): GroupedMatches[] {
  const map = new Map<number, GroupedMatches>()

  for (const match of matches) {
    const { id, name, emblem } = match.competition
    if (!map.has(id)) {
      map.set(id, { competitionId: id, competitionName: name, competitionEmblem: emblem, matches: [] })
    }
    map.get(id)!.matches.push(match)
  }

  return Array.from(map.values())
}

/**
 * Kickoff time in the viewer's own timezone, on a 24-hour clock.
 *
 * Football schedules are written as 15:00 / 20:45 the world over, and a score
 * list is a dense column of numbers - "03:30 AM" is both wider and harder to
 * scan than "03:30". The date itself still comes from the browser's locale.
 */
export function formatKickoffTime(utcDate: string): string {
  return new Date(utcDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function getStatusLabel(status: MatchStatus, minute: number | undefined, utcDate: string): string {
  switch (status) {
    case 'IN_PLAY':
      return `${minute ?? '?'}'`
    case 'PAUSED':
      return 'HT'
    case 'FINISHED':
      return 'FT'
    case 'CANCELLED':
      return 'CANC'
    case 'POSTPONED':
      return 'PPD'
    default:
      return formatKickoffTime(utcDate)
  }
}

export function isLive(status: MatchStatus): boolean {
  return status === 'IN_PLAY' || status === 'PAUSED'
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getDateRange(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return formatDate(d)
}

/* ------------------------------------------------------------------ *
 * Time-zone aware helpers for the home feed (PRD MAT-1, MAT-6).
 *
 * Added alongside the helpers above rather than changing them: other modules
 * rely on `formatKickoffTime` using the browser's zone.
 * ------------------------------------------------------------------ */

/**
 * Kickoff time on a 24-hour clock in an explicit zone. Falls back to the
 * browser's zone when `timeZone` is absent or unknown to the runtime.
 */
export function formatKickoffTimeIn(utcDate: string, timeZone?: string | null): string {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
  if (timeZone) {
    try {
      return new Date(utcDate).toLocaleTimeString([], { ...options, timeZone })
    } catch {
      // unknown zone - fall through to the browser's own
    }
  }
  return new Date(utcDate).toLocaleTimeString([], options)
}

/**
 * Formats a calendar date ('YYYY-MM-DD') without any zone shifting: the date
 * is already local, so it is rendered as a UTC date to keep the day intact.
 */
export function formatYmd(ymd: string, options: Intl.DateTimeFormatOptions, locale = 'en-GB'): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
}

/** Whole days from `fromYmd` to `toYmd` (both 'YYYY-MM-DD'). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const toUtc = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(toYmd) - toUtc(fromYmd)) / 86_400_000)
}

/**
 * 'Today' / 'Yesterday' / 'Tomorrow' relative to `todayYmd` (today in the
 * user's zone), otherwise a short date such as 'Sat 21 Nov'.
 */
export function relativeDayLabel(ymd: string, todayYmd: string): string {
  const diff = daysBetween(todayYmd, ymd)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return formatYmd(ymd, { weekday: 'short', day: 'numeric', month: 'short' })
}
