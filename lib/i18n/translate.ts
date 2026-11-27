/**
 * The translator. Isomorphic: used by `getT()` on the server and `useT()` on
 * the client, and has no React or Next imports so it can be unit-tested.
 *
 * Fallback order for a key: active locale -> English -> (dev) the key itself,
 * (production) an empty string. A raw key such as "home.empty.title" leaking
 * into a production page reads as a broken app, while an empty label in a
 * spot that already has an icon or a number usually goes unnoticed; dev keeps
 * the key so the gap is obvious while building.
 */

import { getIntlLocale, type Locale } from './config'
import { en } from './dictionaries/en'
import { ur } from './dictionaries/ur'
import { NUMBERING_SYSTEM } from './format'
import type { Message, MessageKey, MessageVars, PluralMessage } from './types'

type LooseDictionary = Partial<Record<string, Message>>

export const DICTIONARIES: Record<Locale, LooseDictionary> = { en, ur }

export type TFunction = (key: MessageKey, vars?: MessageVars) => string

export interface TranslatorOptions {
  /** Override dictionaries - tests use this to simulate missing entries. */
  dictionaries?: Partial<Record<Locale, LooseDictionary>>
  /** Defaults to NODE_ENV === 'production'. */
  production?: boolean
  /** Called once per missing (locale, key) pair; defaults to a dev warning. */
  onMissing?: (key: string, locale: Locale) => void
}

/** Type guard for keys built at runtime, e.g. `competition.${code}`. */
export function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key)
}

const pluralRulesCache = new Map<string, Intl.PluralRules>()

function pluralRules(locale: Locale): Intl.PluralRules {
  const tag = getIntlLocale(locale)
  let rules = pluralRulesCache.get(tag)
  if (!rules) {
    rules = new Intl.PluralRules(tag)
    pluralRulesCache.set(tag, rules)
  }
  return rules
}

function isUsable(message: Message | undefined): message is Message {
  if (message === undefined || message === null) return false
  if (typeof message === 'string') return message.length > 0
  return typeof message.other === 'string' && message.other.length > 0
}

function selectPlural(message: PluralMessage, count: unknown, locale: Locale): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) return message.other
  const category = pluralRules(locale).select(count) as keyof PluralMessage
  return message[category] ?? message.other
}

function formatVar(value: string | number, locale: Locale): string {
  if (typeof value === 'string') return value
  // No grouping: interpolated numbers are counts, years ("Est. 1892") and
  // matchdays, where "1,892" would be wrong. Callers that want grouping
  // (attendance) pass a string from formatNumber().
  return new Intl.NumberFormat(getIntlLocale(locale), {
    useGrouping: false,
    maximumFractionDigits: 2,
    numberingSystem: NUMBERING_SYSTEM,
  } as Intl.NumberFormatOptions).format(value)
}

/** Replaces `{name}` placeholders. Unknown placeholders: kept in dev, dropped in production. */
export function interpolate(
  template: string,
  vars: MessageVars | undefined,
  locale: Locale,
  production: boolean
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars?.[name]
    if (value === undefined || value === null) return production ? '' : whole
    return formatVar(value, locale)
  })
}

const warned = new Set<string>()

function defaultOnMissing(key: string, locale: Locale) {
  const id = `${locale}:${key}`
  if (warned.has(id)) return
  warned.add(id)
  console.warn(`[i18n] missing "${key}" for locale "${locale}"`)
}

export function createTranslator(locale: Locale, options: TranslatorOptions = {}): TFunction {
  const production = options.production ?? process.env.NODE_ENV === 'production'
  const dictionaries = { ...DICTIONARIES, ...options.dictionaries }
  const onMissing = options.onMissing ?? (production ? () => {} : defaultOnMissing)

  return (key, vars) => {
    let message = dictionaries[locale]?.[key]
    let messageLocale: Locale = locale

    if (!isUsable(message)) {
      if (locale !== 'en') onMissing(key, locale)
      message = dictionaries.en?.[key]
      messageLocale = 'en'
    }

    if (!isUsable(message)) {
      onMissing(key, 'en')
      return production ? '' : key
    }

    const template =
      typeof message === 'string' ? message : selectPlural(message, vars?.count, messageLocale)
    return interpolate(template, vars, messageLocale, production)
  }
}

/**
 * Translates a runtime-built key, falling back to `fallback` (usually the
 * provider's own English text) when there is no dictionary entry at all -
 * e.g. a competition code added to the feed before it was added here.
 */
export function translateOr(t: TFunction, key: string, fallback: string, vars?: MessageVars): string {
  return isMessageKey(key) ? t(key, vars) || fallback : fallback
}
