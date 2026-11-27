import type { en } from './dictionaries/en'

/**
 * A message whose wording depends on a count. Keys are Intl.PluralRules
 * categories; `other` is mandatory because every language has it and it is
 * the fallback when a category is missing (English and Urdu only use
 * `one` / `other`, Arabic would add `zero`, `two`, `few` and `many`).
 */
export interface PluralMessage {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

export type Message = string | PluralMessage

/** Every key in the English dictionary - English is the source of truth. */
export type MessageKey = keyof typeof en

/**
 * The shape every other language must satisfy. Mapped from the English
 * dictionary, so a key missing from `ur.ts` (or a stray extra one) is a
 * compile error, and a plural message cannot silently become a plain string.
 */
export type Dictionary = {
  readonly [K in MessageKey]: (typeof en)[K] extends string ? string : PluralMessage
}

/** Values for `{name}` placeholders. Numbers are formatted for the locale. */
export type MessageVars = Record<string, string | number>
