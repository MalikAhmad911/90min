/**
 * Server-side locale access for server components, layouts and
 * `generateMetadata`. Never import this from a client component -
 * `next/headers` only exists on the server.
 *
 * Note for the integrator: reading cookies opts the route into dynamic
 * rendering. Once `app/layout.tsx` calls `getLocale()`, every page renders per
 * request (statically generated league pages included). That is the price of
 * a server-rendered `dir` with no flash of the wrong layout; see README for
 * the middleware alternative if static output matters more.
 */

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, getDirection, resolveLocale, type Direction, type Locale } from './config'
import { createTranslator, type TFunction } from './translate'

/**
 * The visitor's locale, from the cookie only, allow-listed. Deliberately not
 * wrapped in try/catch: Next signals "this route is dynamic" by throwing from
 * `cookies()` during static generation, and swallowing that would freeze the
 * default locale into a static page.
 */
export function getLocale(): Locale {
  return resolveLocale(cookies().get(LOCALE_COOKIE)?.value)
}

export function getT(locale: Locale = getLocale()): TFunction {
  return createTranslator(locale)
}

/** Spread onto `<html>`: `<html {...getHtmlAttributes()}>`. */
export function getHtmlAttributes(locale: Locale = getLocale()): { lang: string; dir: Direction } {
  return { lang: locale, dir: getDirection(locale) }
}
