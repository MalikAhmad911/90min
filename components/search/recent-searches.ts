import { z } from 'zod'

/**
 * Recent searches, kept in the browser only (localStorage).
 *
 * Storage is untrusted input: another script, a browser extension or an old
 * version of this app may have written anything under the key. Every entry is
 * therefore validated on the way out, and an `href` must be a same-origin path
 * - otherwise a tampered entry could turn a recent-search link into
 * `javascript:` or an off-site redirect.
 *
 * Every storage access is wrapped in try/catch: Safari private mode, disabled
 * cookies and full quotas all throw, and search must keep working regardless.
 */

export const RECENT_SEARCHES_KEY = '90min:recent-searches'
export const RECENT_SEARCHES_MAX = 6

const SAME_ORIGIN_PATH = /^\/(?![/\\])/

const recentSearchSchema = z.object({
  type: z.enum(['query', 'team', 'competition', 'player', 'match']),
  label: z.string().min(1).max(120),
  sublabel: z.string().max(160).optional(),
  href: z.string().max(300).regex(SAME_ORIGIN_PATH),
  // http(s) only: these end up in an <img src>.
  image: z.url({ protocol: /^https?$/ }).max(500).nullable().optional(),
})

export type RecentSearch = z.infer<typeof recentSearchSchema>

/** Parses stored JSON, dropping anything malformed instead of failing. */
export function parseRecentSearches(raw: string | null): RecentSearch[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: RecentSearch[] = []
  for (const entry of data) {
    const parsed = recentSearchSchema.safeParse(entry)
    if (parsed.success) out.push(parsed.data)
    if (out.length >= RECENT_SEARCHES_MAX) break
  }
  return out
}

/** Newest first, de-duplicated by destination, capped. */
export function mergeRecentSearch(
  list: readonly RecentSearch[],
  entry: RecentSearch,
  max = RECENT_SEARCHES_MAX
): RecentSearch[] {
  return [entry, ...list.filter((r) => r.href !== entry.href)].slice(0, max)
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readRecentSearches(): RecentSearch[] {
  try {
    return parseRecentSearches(storage()?.getItem(RECENT_SEARCHES_KEY) ?? null)
  } catch {
    return []
  }
}

/** Saves an entry and returns the new list (or the old one if storage fails). */
export function saveRecentSearch(entry: RecentSearch): RecentSearch[] {
  const parsed = recentSearchSchema.safeParse(entry)
  const current = readRecentSearches()
  if (!parsed.success) return current
  const next = mergeRecentSearch(current, parsed.data)
  try {
    storage()?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
  } catch {
    // Quota or privacy mode: the list just will not persist.
  }
  return next
}

export function clearRecentSearches(): void {
  try {
    storage()?.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    // Nothing to do; the in-memory list is cleared by the caller.
  }
}
