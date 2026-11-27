/**
 * Locale-aware formatting on top of Intl - no date library.
 *
 * Digits: every helper forces `numberingSystem: 'latn'`, in Urdu too.
 * Pakistani sports media (Geo Super, Dawn, Jang's sports pages) print scores,
 * minutes and kickoff times in Latin digits, and a score column mixing ۲ and 2
 * depending on the user's locale would be unreadable next to the provider's
 * own data. `ur-PK` happens to default to Latin digits in current ICU, but
 * `ur-IN` and older engines default to Eastern Arabic (۰۱۲), so it is set
 * explicitly rather than relied on.
 *
 * Scores, minutes and kickoff times are also wrapped in a Unicode LTR isolate
 * when they are going to be embedded in running text, because in an RTL
 * paragraph "45'" would otherwise render as "'45" and "2 – 1" could swap ends.
 * When rendering them as their own element, prefer `dir="ltr"` on that
 * element instead (see README).
 */

import { getIntlLocale, type Locale } from './config'
import type { MessageKey, MessageVars } from './types'

export type TimeFormat = '24h' | '12h'

export const NUMBERING_SYSTEM = 'latn'

/** U+2066 LEFT-TO-RIGHT ISOLATE ... U+2069 POP DIRECTIONAL ISOLATE. */
export function ltrIsolate(text: string): string {
  return `⁦${text}⁩`
}

export function formatNumber(value: number, locale: Locale, options: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return ''
  return new Intl.NumberFormat(getIntlLocale(locale), {
    ...options,
    numberingSystem: NUMBERING_SYSTEM,
  } as Intl.NumberFormatOptions).format(value)
}

export type DatePreset =
  /** 20 Nov */
  | 'dayMonth'
  /** Fri, 20 Nov - the date navigator. */
  | 'weekdayDayMonth'
  /** 20 Nov 2026 - head-to-head rows. */
  | 'dayMonthYear'
  /** Friday 20 November 2026 */
  | 'full'

const DATE_PRESETS: Record<DatePreset, Intl.DateTimeFormatOptions> = {
  dayMonth: { day: 'numeric', month: 'short' },
  weekdayDayMonth: { weekday: 'short', day: 'numeric', month: 'short' },
  dayMonthYear: { day: 'numeric', month: 'short', year: 'numeric' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
}

interface ZoneOption {
  /** IANA zone; omitted means the runtime's zone (the browser's, client-side). */
  timeZone?: string
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}

export function formatDate(
  value: Date | string | number,
  locale: Locale,
  { preset = 'dayMonth', timeZone }: ZoneOption & { preset?: DatePreset } = {}
): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    ...DATE_PRESETS[preset],
    timeZone,
    numberingSystem: NUMBERING_SYSTEM,
  }).format(date)
}

/**
 * Clock time, honouring the user's 12h/24h preference. 24h is the default:
 * football schedules are written 15:00 / 20:45 the world over, and a dense
 * score column scans better without AM/PM.
 */
export function formatTime(
  value: Date | string | number,
  locale: Locale,
  { timeFormat = '24h', timeZone }: ZoneOption & { timeFormat?: TimeFormat } = {}
): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    // hourCycle rather than hour12: hour12:false gives "24:05" past midnight
    // in some engines, h23 never does.
    hourCycle: timeFormat === '12h' ? 'h12' : 'h23',
    timeZone,
    numberingSystem: NUMBERING_SYSTEM,
  }).format(date)
}

/** Kickoff time for embedding in text: formatted, then LTR-isolated. */
export function formatKickoff(
  value: Date | string | number,
  locale: Locale,
  options: ZoneOption & { timeFormat?: TimeFormat } = {}
): string {
  const time = formatTime(value, locale, options)
  return time ? ltrIsolate(time) : ''
}

/**
 * "2 – 1". Scores are always home first, Latin digits, and isolated so an RTL
 * paragraph cannot flip them into "1 – 2". `null` (not yet played) is "-".
 */
export function formatScore(home: number | null | undefined, away: number | null | undefined): string {
  const side = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? String(n) : '-')
  return ltrIsolate(`${side(home)} – ${side(away)}`)
}

/** Match minute: 67' or 45+2'. Isolated for the same reason as the score. */
export function formatMinute(minute: number | null | undefined, injuryTime?: number | null): string {
  if (typeof minute !== 'number' || !Number.isFinite(minute)) return ltrIsolate("?'")
  const extra = typeof injuryTime === 'number' && injuryTime > 0 ? `+${injuryTime}` : ''
  return ltrIsolate(`${minute}${extra}'`)
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

type Translate = (key: MessageKey, vars?: MessageVars) => string

/**
 * The date navigator's label: Today / Yesterday / Tomorrow, else "Fri, 20 Nov".
 *
 * Both dates are calendar days ('YYYY-MM-DD') already resolved in the user's
 * time zone (see `localDateString` in lib/timezone.ts), so the comparison is
 * plain string arithmetic and the weekday is formatted at UTC noon - never
 * shifted onto a neighbouring day by the runtime's own offset.
 */
export function formatDayLabel(ymd: string, todayYmd: string, locale: Locale, t: Translate): string {
  if (!YMD.test(ymd) || !YMD.test(todayYmd)) return ''
  if (ymd === todayYmd) return t('date.today')
  if (ymd === shiftYmd(todayYmd, -1)) return t('date.yesterday')
  if (ymd === shiftYmd(todayYmd, 1)) return t('date.tomorrow')
  return formatDate(`${ymd}T12:00:00Z`, locale, { preset: 'weekdayDayMonth', timeZone: 'UTC' })
}
