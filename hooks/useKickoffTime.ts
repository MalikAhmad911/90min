'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { useLocale, useTimeFormat } from '@/lib/i18n/client'
import {
  UTC_KICKOFF_DISPLAY,
  formatKickoffClock,
  formatKickoffDay,
  type KickoffDayOptions,
  type KickoffDisplay,
} from '@/lib/kickoff-time'
import { useIsClient } from '@/lib/seo/client-time'
import { getPreferredTimeZone, isValidTimeZone, subscribePreferredTimeZone } from '@/lib/timezone'

export interface KickoffTimeFormatter {
  /** False on the server and during hydration, when everything is UTC. */
  local: boolean
  display: KickoffDisplay
  /** "20:45" / "08:45 pm" in the reader's zone and clock. */
  time: (utcDate: string) => string
  /** The kick-off's calendar date in the reader's zone. */
  day: (utcDate: string, options: KickoffDayOptions) => string
}

/**
 * The one place kick-off times get the reader's preferences: the time zone
 * from Settings (lib/timezone.ts, else the browser's own) and the 12h/24h
 * choice (lib/i18n/time-format.ts).
 *
 * Both live in localStorage and are read directly, so this works with or
 * without a <LocaleProvider> above it (the locale then defaults to English).
 * The server and the hydration pass render UTC on a 24-hour clock; the
 * reader's zone and clock apply from the render straight after, and on
 * client-side navigations from the first render. A change in Settings, or in
 * another tab, re-renders every user of the hook.
 *
 * `timeZone` overrides the stored zone, for a view that already resolved one
 * (the home feed); an invalid one is ignored.
 */
export function useKickoffTime(timeZone?: string | null): KickoffTimeFormatter {
  const local = useIsClient()
  const timeFormat = useTimeFormat()
  const preferredZone = useSyncExternalStore(
    subscribePreferredTimeZone,
    getPreferredTimeZone,
    () => UTC_KICKOFF_DISPLAY.timeZone
  )
  const { locale } = useLocale()

  return useMemo(() => {
    const display: KickoffDisplay = local
      ? { timeZone: isValidTimeZone(timeZone) ? timeZone : preferredZone, timeFormat }
      : UTC_KICKOFF_DISPLAY
    return {
      local,
      display,
      time: (utcDate) => formatKickoffClock(utcDate, display, locale),
      day: (utcDate, options) => formatKickoffDay(utcDate, display, options, locale),
    }
  }, [local, timeZone, preferredZone, timeFormat, locale])
}
