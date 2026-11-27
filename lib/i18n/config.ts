/**
 * Locale catalogue.
 *
 * Deliberately dependency-free (no `next/headers`, no React) so it can be
 * imported from server components, client components, middleware and tests.
 *
 * `intl` is the BCP 47 tag handed to Intl APIs. It is kept separate from the
 * short `code` used in the cookie and in `<html lang>` because the region
 * matters for Intl (ur-PK, not ur-IN, which defaults to Eastern Arabic digits
 * and Indian date order) but adds nothing to the URL or the cookie.
 */

export const LOCALES = [
  { code: 'en', dir: 'ltr', intl: 'en-GB', nativeName: 'English' },
  { code: 'ur', dir: 'rtl', intl: 'ur-PK', nativeName: 'اردو' },
] as const

export type LocaleConfig = (typeof LOCALES)[number]
export type Locale = LocaleConfig['code']
export type Direction = LocaleConfig['dir']

export const DEFAULT_LOCALE: Locale = 'en'

/** Read on the server to pick `<html lang dir>`; written by the Settings page. */
export const LOCALE_COOKIE = '90min-locale'

/** One year: a language choice is a long-lived preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const CODES: readonly string[] = LOCALES.map((l) => l.code)

/** Allow-list check. Anything else in the cookie is ignored, never echoed. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && CODES.includes(value)
}

/**
 * Turns an untrusted value (cookie, query string, storage) into a supported
 * locale. Exact match only: 'UR', 'ur-PK' or 'ur; drop table' all fall back to
 * the default rather than being normalised, so the cookie has one valid form.
 */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function getLocaleConfig(locale: Locale): LocaleConfig {
  return LOCALES.find((l) => l.code === locale) ?? LOCALES[0]
}

export function getDirection(locale: Locale): Direction {
  return getLocaleConfig(locale).dir
}

export function getIntlLocale(locale: Locale): string {
  return getLocaleConfig(locale).intl
}

/**
 * The `Set-Cookie`-style string the browser writes when the user picks a
 * language. SameSite=Lax and Path=/ so every page's server render sees it.
 * Not HttpOnly on purpose: it is a display preference set from the client,
 * and it carries no authority - the server only ever uses it after
 * `resolveLocale`.
 */
export function buildLocaleCookie(locale: Locale, secure = false): string {
  const parts = [
    `${LOCALE_COOKIE}=${locale}`,
    'Path=/',
    `Max-Age=${LOCALE_COOKIE_MAX_AGE}`,
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** Reads the locale out of a raw `document.cookie` / `Cookie` header string. */
export function readLocaleFromCookieHeader(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === LOCALE_COOKIE) {
      return resolveLocale(part.slice(eq + 1).trim())
    }
  }
  return DEFAULT_LOCALE
}
