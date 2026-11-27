import type { Metadata } from 'next'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { isDatabaseConfigured } from '@/lib/db'
import { searchAll } from '@/lib/db/search-queries'
import { parseSearchQuery, SEARCH_MAX_LENGTH } from '@/components/search/schema'
import { SEARCH_GROUPS, totalResults, type SearchResults } from '@/components/search/types'
import { ResultVisual } from '@/components/search/ResultVisual'

/**
 * /search?q= - the full, server-rendered results page.
 *
 * Where Enter and "see all results" lead, and where the search form lands when
 * JavaScript is off: every result is a plain link in the HTML.
 * Kept out of search engines - result pages are thin, near-duplicate content.
 */

export const dynamic = 'force-dynamic'
// See app/api/search/route.ts: the Neon driver's fetch must bypass Next's Data Cache.
export const fetchCache = 'force-no-store'

/** Per group; the dropdown shows 5. */
const PAGE_LIMIT = 20

type PageProps = { searchParams: { q?: string | string[] } }

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function generateMetadata({ searchParams }: PageProps): Metadata {
  const parsed = parseSearchQuery(firstParam(searchParams.q))
  return {
    title: parsed.ok ? `Search: ${parsed.q} | 90 Min Tactics` : 'Search | 90 Min Tactics',
    robots: { index: false, follow: true },
  }
}

type Outcome =
  | { kind: 'prompt' }
  | { kind: 'invalid'; error: string }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'results'; results: SearchResults }

async function runSearch(raw: string | undefined): Promise<Outcome> {
  if (raw === undefined || raw.trim() === '') return { kind: 'prompt' }
  const parsed = parseSearchQuery(raw)
  if (!parsed.ok) return { kind: 'invalid', error: parsed.error }
  if (!isDatabaseConfigured()) return { kind: 'unavailable' }
  try {
    return { kind: 'results', results: await searchAll(parsed.q, { limit: PAGE_LIMIT }) }
  } catch (err) {
    console.error('[search page] query failed:', err instanceof Error ? err.message : err)
    return { kind: 'failed' }
  }
}

export default async function SearchPage({ searchParams }: PageProps) {
  const raw = firstParam(searchParams.q)
  const outcome = await runSearch(raw)

  return (
    <div className="px-4 py-5">
      <h1 className="text-lg font-bold text-content-primary mb-4">Search</h1>

      {/* A plain GET form: works with JavaScript disabled. */}
      <form action="/search" method="get" role="search" className="mb-6">
        <label htmlFor="search-page-q" className="sr-only">
          Search teams, competitions, players and matches
        </label>
        <div className="flex items-center gap-2 rounded-full bg-bg-elevated px-4 py-2 text-content-muted focus-within:ring-2 focus-within:ring-accent-green">
          <Search size={16} aria-hidden="true" className="shrink-0" />
          <input
            id="search-page-q"
            name="q"
            type="search"
            defaultValue={raw ?? ''}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Teams, competitions, players, matches"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-bg-surface px-3 py-1 text-xs font-semibold text-content-primary hover:bg-bg-primary"
          >
            Search
          </button>
        </div>
      </form>

      <SearchOutcome outcome={outcome} />
    </div>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-bg-surface px-4 py-6 text-sm text-content-secondary">{children}</p>
}

function SearchOutcome({ outcome }: { outcome: Outcome }) {
  switch (outcome.kind) {
    case 'prompt':
      return <Message>Search for teams, competitions, players and matches.</Message>
    case 'invalid':
      return <Message>{outcome.error}.</Message>
    case 'unavailable':
      return <Message>Search is unavailable right now.</Message>
    case 'failed':
      return <Message>Search is not responding. Try again in a moment.</Message>
    case 'results':
      break
  }

  const { results } = outcome
  const total = totalResults(results)
  if (total === 0) {
    return (
      <Message>
        No results for <span className="font-medium text-content-primary">“{results.query}”</span>. Check the
        spelling, or try a shorter name.
      </Message>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-content-muted" aria-live="polite">
        {total} result{total === 1 ? '' : 's'} for “{results.query}”
      </p>
      {SEARCH_GROUPS.map(({ key, title }) => {
        const items = results[key]
        if (!items.length) return null
        const headingId = `search-group-${key}`
        return (
          <section key={key} aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted"
            >
              {title}
            </h2>
            <ul className="divide-y divide-divider overflow-hidden rounded-xl bg-bg-surface">
              {items.map((item) => (
                <li key={`${item.type}:${item.id}`}>
                  <Link
                    href={item.href}
                    className="flex items-center px-4 py-3 hover:bg-bg-elevated focus-visible:bg-bg-elevated focus-visible:outline-none"
                  >
                    <ResultVisual
                      type={item.type}
                      label={item.label}
                      sublabel={item.sublabel}
                      image={item.image}
                      image2={item.image2}
                      label2={item.label2}
                      size={28}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
