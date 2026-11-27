import { z } from 'zod'

/**
 * The one definition of what a search query may be.
 *
 * Shared by the API route, the server-rendered /search page and the client
 * combobox, so the browser never fires a request the server would reject and
 * the two server entry points cannot drift apart.
 */

export const SEARCH_MIN_LENGTH = 2
export const SEARCH_MAX_LENGTH = 64

/**
 * Allow-list of characters. Letters and marks in any script (team names such
 * as "Fenerbahçe", "Bodø/Glimt"), digits ("1. FC Köln") and the punctuation
 * real names use ("M'gladbach", "Brighton & Hove Albion", "Paris Saint-Germain").
 * Anything else - quotes, wildcards, angle brackets, control characters - has
 * no business in a name and is rejected rather than silently stripped, so what
 * the server searched for is always exactly what the user typed.
 */
const ALLOWED_CHARACTERS = /^[\p{L}\p{M}\p{N}\s'’.\-&/()]+$/u

export const searchQuerySchema = z.object({
  q: z
    .string({ error: 'Missing search query' })
    // trim runs before the length checks, so "  a  " is too short.
    .trim()
    .min(SEARCH_MIN_LENGTH, { error: `Type at least ${SEARCH_MIN_LENGTH} characters` })
    .max(SEARCH_MAX_LENGTH, { error: `Use at most ${SEARCH_MAX_LENGTH} characters` })
    .regex(ALLOWED_CHARACTERS, { error: 'Use letters, numbers and spaces' })
    // Collapse runs of whitespace: "man   city" and "man city" are one query,
    // which also makes them one CDN cache entry.
    .transform((s) => s.replace(/\s+/g, ' ')),
})

export type SearchQueryResult = { ok: true; q: string } | { ok: false; error: string }

/** Validates an untrusted query value (string, array, null...). */
export function parseSearchQuery(raw: unknown): SearchQueryResult {
  const parsed = searchQuerySchema.safeParse({ q: raw })
  if (parsed.success) return { ok: true, q: parsed.data.q }
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid search query' }
}

/** True when the text is worth sending to the server. */
export function isSearchable(raw: string): boolean {
  return parseSearchQuery(raw).ok
}

/** URL of the full results page for a query. */
export function searchPageHref(q: string): string {
  return `/search?q=${encodeURIComponent(q)}`
}
