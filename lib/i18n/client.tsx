'use client'

/**
 * Client-side i18n: the provider, hooks, and the language switch.
 *
 * The locale itself is decided on the server (cookie -> `getLocale()`) and
 * handed down through `<LocaleProvider locale=…>`, so server and client render
 * the same strings and hydration never disagrees. Both dictionaries are bundled
 * (each is a few KB gzipped); English is needed anyway as the fallback.
 *
 * Without a provider above them, the hooks fall back to English - components
 * can adopt `useT()` before the root layout is wired without crashing.
 */

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
  DEFAULT_LOCALE,
  buildLocaleCookie,
  getLocaleConfig,
  readLocaleFromCookieHeader,
  resolveLocale,
  type Direction,
  type Locale,
} from './config'
import { formatDate, formatDayLabel, formatKickoff, formatNumber, formatTime, type DatePreset, type TimeFormat } from './format'
import { timeFormatStore } from './time-format'
import { createTranslator, type TFunction } from './translate'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({ locale, children }: { locale: string; children: ReactNode }) {
  // Re-validated here too: the prop may come from anywhere the integrator wires.
  return <LocaleContext.Provider value={resolveLocale(locale)}>{children}</LocaleContext.Provider>
}

export interface LocaleInfo {
  locale: Locale
  dir: Direction
  /** BCP 47 tag for Intl, e.g. 'ur-PK'. */
  intl: string
}

export function useLocale(): LocaleInfo {
  const locale = useContext(LocaleContext)
  return useMemo(() => {
    const config = getLocaleConfig(locale)
    return { locale, dir: config.dir, intl: config.intl }
  }, [locale])
}

export function useT(): TFunction {
  const locale = useContext(LocaleContext)
  return useMemo(() => createTranslator(locale), [locale])
}

/** The 12h/24h preference, live across components and tabs. */
export function useTimeFormat(): TimeFormat {
  return useSyncExternalStore(timeFormatStore.subscribe, timeFormatStore.read, () => timeFormatStore.serverValue)
}

/**
 * Formatters bound to the active locale and the user's time preferences.
 * Pass `timeZone` from `getPreferredTimeZone()` (lib/timezone.ts) after mount;
 * omitted, the browser's zone is used.
 */
export function useFormat(timeZone?: string) {
  const { locale } = useLocale()
  const t = useT()
  const timeFormat = useTimeFormat()
  return useMemo(
    () => ({
      number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale, options),
      date: (value: Date | string | number, preset?: DatePreset) => formatDate(value, locale, { preset, timeZone }),
      time: (value: Date | string | number) => formatTime(value, locale, { timeFormat, timeZone }),
      kickoff: (value: Date | string | number) => formatKickoff(value, locale, { timeFormat, timeZone }),
      dayLabel: (ymd: string, todayYmd: string) => formatDayLabel(ymd, todayYmd, locale, t),
    }),
    [locale, t, timeFormat, timeZone]
  )
}

/**
 * Persists the language choice in the cookie the server reads. Returns false
 * when the browser refused the cookie (blocked, or a privacy extension), so the
 * caller can show an error instead of reloading into the old language.
 * The caller reloads: `dir` and `lang` live on <html>, which only the server
 * render sets, so a client-only switch would leave the layout mirrored wrongly.
 */
export function persistLocale(locale: Locale): boolean {
  try {
    document.cookie = buildLocaleCookie(locale, window.location.protocol === 'https:')
    return readLocaleFromCookieHeader(document.cookie) === locale
  } catch {
    return false
  }
}
