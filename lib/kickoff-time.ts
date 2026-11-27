/**
 * Kick-off times and dates in the reader's chosen zone and clock (12h/24h).
 *
 * Pure formatting; the hook that feeds it the stored preferences is
 * `useKickoffTime` in hooks/useKickoffTime.ts. Before hydration everything
 * renders in UTC on a 24-hour clock (UTC_KICKOFF_DISPLAY), which is the same
 * on every server and browser and so can never cause a hydration mismatch.
 */

import { DEFAULT_LOCALE, getIntlLocale, type Locale } from './i18n/config'
import { NUMBERING_SYSTEM, formatTime, type TimeFormat } from './i18n/format'

export interface KickoffDisplay {
  /** IANA zone, e.g. 'Asia/Karachi'. */
  timeZone: string
  timeFormat: TimeFormat
}

/** What the server and the hydration pass render. */
export const UTC_KICKOFF_DISPLAY: KickoffDisplay = { timeZone: 'UTC', timeFormat: '24h' }

export type KickoffDayOptions = Pick<Intl.DateTimeFormatOptions, 'weekday' | 'day' | 'month' | 'year'>

/** Runs `format` in the display's zone, or in UTC if the runtime rejects it. */
function inZone(display: KickoffDisplay, format: (timeZone: string) => string): string {
  try {
    return format(display.timeZone)
  } catch {
    return format('UTC')
  }
}

/** "20:45", or "08:45 pm" on a 12-hour clock. '' for an invalid date. */
export function formatKickoffClock(
  value: Date | string | number,
  display: KickoffDisplay,
  locale: Locale = DEFAULT_LOCALE
): string {
  return inZone(display, (timeZone) => formatTime(value, locale, { timeFormat: display.timeFormat, timeZone }))
}

/**
 * The kick-off's calendar date in the display's zone, e.g. "20 Nov" or
 * "Fri 20 Nov" - a 23:30 UTC kick-off is already the next day in Karachi.
 */
export function formatKickoffDay(
  value: Date | string | number,
  display: KickoffDisplay,
  options: KickoffDayOptions,
  locale: Locale = DEFAULT_LOCALE
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return inZone(display, (timeZone) =>
    new Intl.DateTimeFormat(getIntlLocale(locale), {
      ...options,
      timeZone,
      numberingSystem: NUMBERING_SYSTEM,
    }).format(date)
  )
}
