'use client'

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { ResultVisual, SeeAllVisual } from './ResultVisual'
import { buildOptions, comboboxReducer, initialComboboxState, type ComboboxOption } from './combobox-state'
import { clearRecentSearches, readRecentSearches, saveRecentSearch, type RecentSearch } from './recent-searches'
import { isSearchable, parseSearchQuery, SEARCH_MAX_LENGTH, searchPageHref } from './schema'
import { totalResults, type SearchResults } from './types'

/**
 * Global search box (PRD SR-1), following the WAI-ARIA 1.2 combobox pattern
 * with a grouped listbox popup:
 *   - focus stays in the input; the highlighted option is conveyed through
 *     aria-activedescendant, so screen readers announce it as the user arrows;
 *   - ArrowUp / ArrowDown move, Enter opens the highlighted option (or the full
 *     results page), Escape closes and then clears.
 *
 * It is a real GET form to /search, so without JavaScript Enter still lands on
 * the server-rendered results page.
 */

const DEBOUNCE_MS = 150
/** Small per-tab memo so backspacing over a query is instant. */
const responseCache = new Map<string, SearchResults>()
const RESPONSE_CACHE_MAX = 50

interface SearchComboboxProps {
  /** 'popover' floats under the input (desktop); 'sheet' fills the mobile sheet. */
  variant?: 'popover' | 'sheet'
  autoFocus?: boolean
  /** Called after the user picks a destination, e.g. to close the mobile sheet. */
  onNavigate?: () => void
  /** Called on Escape when there is nothing left for Escape to close or clear. */
  onEscape?: () => void
}

export function SearchCombobox({
  variant = 'popover',
  autoFocus = false,
  onNavigate,
  onEscape,
}: SearchComboboxProps) {
  const router = useRouter()
  const [state, dispatch] = useReducer(comboboxReducer, initialComboboxState)
  const [recent, setRecent] = useState<RecentSearch[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestSeq = useRef(0)

  const uid = useId().replace(/:/g, '')
  const inputId = `search-input-${uid}`
  const listboxId = `search-listbox-${uid}`
  const optionId = (index: number) => `search-option-${uid}-${index}`

  // localStorage is only readable after mount; reading it during render would
  // make the server and client HTML disagree.
  useEffect(() => {
    setRecent(readRecentSearches())
  }, [])

  /* ---------------- fetching ---------------- */

  useEffect(() => {
    const parsed = parseSearchQuery(state.query)
    if (!parsed.ok) return
    const q = parsed.q

    const cached = responseCache.get(q.toLowerCase())
    if (cached) {
      const id = ++requestSeq.current
      dispatch({ type: 'request', id })
      dispatch({ type: 'success', id, results: cached })
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const id = ++requestSeq.current
      dispatch({ type: 'request', id })
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const results = (await res.json()) as SearchResults
        if (responseCache.size >= RESPONSE_CACHE_MAX) {
          const oldest = responseCache.keys().next().value
          if (oldest !== undefined) responseCache.delete(oldest)
        }
        responseCache.set(q.toLowerCase(), results)
        dispatch({ type: 'success', id, results })
      } catch (err) {
        // An abort means a newer keystroke replaced this request: not an error.
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        dispatch({ type: 'failure', id })
      }
    }, DEBOUNCE_MS)

    // Runs on the next keystroke and on unmount: cancels both the pending
    // debounce and any request already in flight.
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [state.query])

  /* ---------------- derived ---------------- */

  const searchable = isSearchable(state.query)
  const { flat, groups } = useMemo(
    () => buildOptions(state.query, searchable ? state.results : null, recent),
    [state.query, state.results, searchable, recent]
  )

  const isSheet = variant === 'sheet'
  const panelOpen = isSheet || state.open
  const showRecentHeader = !searchable && recent.length > 0
  const isEmpty = searchable && state.status === 'success' && state.results !== null && totalResults(state.results) === 0
  const isError = searchable && state.status === 'error'
  const isLoading = searchable && state.status === 'loading'
  const hasPanelContent =
    flat.length > 0 || isEmpty || isError || (searchable && isLoading && !state.results)
  const expanded = panelOpen && flat.length > 0
  const activeId = expanded && state.activeIndex >= 0 ? optionId(state.activeIndex) : undefined

  /* ---------------- effects on the DOM ---------------- */

  // Click / tap outside closes the popover. The sheet has its own close button.
  useEffect(() => {
    if (isSheet || !state.open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) dispatch({ type: 'close' })
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isSheet, state.open])

  // Keep the highlighted option visible when arrowing through a long list.
  useEffect(() => {
    if (state.activeIndex < 0) return
    document.getElementById(`search-option-${uid}-${state.activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [state.activeIndex, uid])

  /* ---------------- actions ---------------- */

  const go = useCallback(
    (option: ComboboxOption) => {
      let entry: RecentSearch
      if (option.kind === 'item') {
        const { item } = option
        entry = { type: item.type, label: item.label, sublabel: item.sublabel, href: item.href, image: item.image }
      } else if (option.kind === 'recent') {
        entry = option.recent
      } else {
        entry = { type: 'query', label: option.query, href: option.href }
      }
      setRecent(saveRecentSearch(entry))
      // The box lives in the layout and survives navigation, so reset it:
      // the next focus should offer recent searches, not the old dropdown.
      dispatch({ type: 'clear' })
      dispatch({ type: 'close' })
      inputRef.current?.blur()
      router.push(option.href)
      onNavigate?.()
    },
    [router, onNavigate]
  )

  const submitQuery = useCallback(() => {
    const parsed = parseSearchQuery(state.query)
    if (!parsed.ok) return
    go({ kind: 'all', key: 'all', href: searchPageHref(parsed.q), query: parsed.q })
  }, [state.query, go])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        dispatch({ type: 'move', delta: e.key === 'ArrowDown' ? 1 : -1, count: flat.length })
        break
      case 'Enter': {
        e.preventDefault()
        const active = state.open || isSheet ? flat[state.activeIndex] : undefined
        if (active) go(active)
        else submitQuery()
        break
      }
      case 'Escape':
        if (!isSheet && state.open && hasPanelContent) {
          e.preventDefault()
          dispatch({ type: 'close' })
        } else if (state.query) {
          e.preventDefault()
          dispatch({ type: 'clear' })
        } else {
          onEscape?.()
        }
        break
      case 'Tab':
        // Leaving the field: the popup must not linger over the page.
        if (!isSheet) dispatch({ type: 'close' })
        break
    }
  }

  /* ---------------- render ---------------- */

  const announcement = !searchable
    ? ''
    : isError
      ? 'Search failed. Try again.'
      : isEmpty
        ? `No results for ${state.query.trim()}`
        : state.status === 'success' && state.results
          ? `${totalResults(state.results)} ${totalResults(state.results) === 1 ? 'result' : 'results'} available. Use the arrow keys to browse.`
          : ''

  const panel = (
    <div
      className={
        isSheet
          ? 'fixed left-0 right-0 top-14 bottom-0 overflow-y-auto overscroll-contain bg-bg-primary pb-8'
          : 'absolute left-0 top-full mt-2 w-[min(26rem,calc(100vw-2rem))] max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain rounded-xl border border-divider bg-bg-surface shadow-2xl shadow-black/50 py-1'
      }
    >
      {showRecentHeader ? (
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span id={`${listboxId}-recent`} className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
            Recent searches
          </span>
          <button
            type="button"
            // Keep focus in the input so the popover does not close.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clearRecentSearches()
              setRecent([])
              inputRef.current?.focus()
            }}
            className="text-xs text-content-secondary hover:text-content-primary rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green-dim"
          >
            Clear
          </button>
        </div>
      ) : null}

      {flat.length > 0 ? (
        <div
          role="listbox"
          id={listboxId}
          aria-label="Search suggestions"
          className={isLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}
        >
          {groups.map((group) => {
            const headingId = `${listboxId}-${group.key}`
            const labelledBy = group.key === 'recent' ? `${listboxId}-recent` : group.title ? headingId : undefined
            return (
              <ul
                key={group.key}
                role="group"
                aria-labelledby={labelledBy}
                aria-label={labelledBy ? undefined : 'More'}
                className={group.key === 'all' ? 'border-t border-divider mt-1 pt-1' : ''}
              >
                {group.title && group.key !== 'recent' ? (
                  <li
                    role="presentation"
                    id={headingId}
                    className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted"
                  >
                    {group.title}
                  </li>
                ) : null}
                {group.options.map(({ option, index }) => {
                  const active = index === state.activeIndex
                  return (
                    <li
                      key={option.key}
                      id={optionId(index)}
                      role="option"
                      aria-selected={active}
                      // mousedown would blur the input before click fires.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(option)}
                      onMouseMove={() => dispatch({ type: 'hover', index })}
                      className={`flex items-center px-3 py-2 cursor-pointer select-none ${
                        active ? 'bg-bg-elevated' : ''
                      }`}
                    >
                      {option.kind === 'item' ? (
                        <ResultVisual
                          type={option.item.type}
                          label={option.item.label}
                          sublabel={option.item.sublabel}
                          image={option.item.image}
                          image2={option.item.image2}
                          label2={option.item.label2}
                        />
                      ) : option.kind === 'recent' ? (
                        <ResultVisual
                          type={option.recent.type}
                          label={option.recent.label}
                          sublabel={option.recent.sublabel}
                          image={option.recent.image}
                          recent
                        />
                      ) : (
                        <SeeAllVisual query={option.query} />
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          })}
        </div>
      ) : null}

      {searchable && isLoading && !state.results ? (
        <p className="flex items-center gap-2 px-3 py-3 text-sm text-content-secondary">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Searching…
        </p>
      ) : null}
      {isEmpty ? (
        <p className="px-3 py-3 text-sm text-content-secondary">
          No results for <span className="text-content-primary font-medium">“{state.query.trim()}”</span>
        </p>
      ) : null}
      {isError ? (
        <p className="px-3 py-3 text-sm text-live-red" role="alert">
          Search is not responding. Try again in a moment.
        </p>
      ) : null}
      {isSheet && !searchable && recent.length === 0 ? (
        <p className="px-4 py-6 text-sm text-content-secondary">Search for teams, competitions, players and matches.</p>
      ) : null}
    </div>
  )

  return (
    <div ref={rootRef} className="relative w-full">
      <form
        role="search"
        action="/search"
        method="get"
        onSubmit={(e) => {
          // With JavaScript, Enter is handled in onKeyDown; this catches
          // anything else that submits (e.g. a mobile keyboard's search key).
          e.preventDefault()
          submitQuery()
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Search teams, competitions, players and matches
        </label>
        <div className="flex items-center gap-2 rounded-full bg-bg-elevated px-3 py-1.5 text-content-muted transition-colors focus-within:ring-2 focus-within:ring-accent-green">
          <Search size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <input
            ref={inputRef}
            id={inputId}
            name="q"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listboxId : undefined}
            aria-activedescendant={activeId}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Search"
            autoFocus={autoFocus}
            value={state.query}
            onChange={(e) => dispatch({ type: 'input', query: e.target.value })}
            onFocus={() => dispatch({ type: 'open' })}
            onKeyDown={onKeyDown}
            // The global :focus-visible ring would draw a second ring inside the
            // pill; the pill's focus-within ring is the indicator instead.
            className="min-w-0 flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
          />
          {isLoading ? (
            <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden="true" />
          ) : null}
          {state.query ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                dispatch({ type: 'clear' })
                inputRef.current?.focus()
              }}
              className="shrink-0 rounded-full p-0.5 text-content-muted hover:text-content-primary"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </form>

      {panelOpen && (hasPanelContent || showRecentHeader || isSheet) ? panel : null}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}
