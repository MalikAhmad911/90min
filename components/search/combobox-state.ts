import type { SearchItem, SearchResults } from './types'
import { SEARCH_GROUPS } from './types'
import { isSearchable, searchPageHref } from './schema'
import type { RecentSearch } from './recent-searches'

/**
 * The search combobox's state machine, kept pure so it can be unit tested
 * without a DOM. The component only wires events and fetches to it.
 */

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface ComboboxState {
  query: string
  open: boolean
  status: SearchStatus
  /** Last results that arrived. Kept while a newer request loads, to avoid flicker. */
  results: SearchResults | null
  /** Index into the flattened option list; -1 means none. */
  activeIndex: number
  /** Id of the newest request. Responses for any other id are stale. */
  latestRequest: number
}

export type ComboboxAction =
  | { type: 'input'; query: string }
  | { type: 'request'; id: number }
  | { type: 'success'; id: number; results: SearchResults }
  | { type: 'failure'; id: number }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'move'; delta: 1 | -1; count: number }
  | { type: 'hover'; index: number }
  | { type: 'clear' }

export const initialComboboxState: ComboboxState = {
  query: '',
  open: false,
  status: 'idle',
  results: null,
  activeIndex: -1,
  latestRequest: 0,
}

export function comboboxReducer(state: ComboboxState, action: ComboboxAction): ComboboxState {
  switch (action.type) {
    case 'input': {
      const searchable = isSearchable(action.query)
      return {
        ...state,
        query: action.query,
        open: true,
        activeIndex: -1,
        // Below the minimum the dropdown shows recent searches instead, so any
        // previous results (and an in-flight request) no longer apply.
        status: searchable ? state.status : 'idle',
        results: searchable ? state.results : null,
        latestRequest: searchable ? state.latestRequest : state.latestRequest + 1,
      }
    }
    case 'request':
      return { ...state, status: 'loading', latestRequest: action.id }
    case 'success':
      // The AbortController should already have cancelled older requests;
      // this is the second line of defence if a response slipped through.
      if (action.id !== state.latestRequest) return state
      return { ...state, status: 'success', results: action.results, activeIndex: -1 }
    case 'failure':
      if (action.id !== state.latestRequest) return state
      return { ...state, status: 'error', activeIndex: -1 }
    case 'open':
      return state.open ? state : { ...state, open: true }
    case 'close':
      return { ...state, open: false, activeIndex: -1 }
    case 'move': {
      if (action.count <= 0) return { ...state, open: true, activeIndex: -1 }
      if (!state.open) {
        // First arrow press on a closed box only opens it.
        return { ...state, open: true, activeIndex: action.delta === 1 ? 0 : action.count - 1 }
      }
      const from = state.activeIndex
      const next =
        from < 0
          ? action.delta === 1
            ? 0
            : action.count - 1
          : (from + action.delta + action.count) % action.count
      return { ...state, activeIndex: next }
    }
    case 'hover':
      return state.activeIndex === action.index ? state : { ...state, activeIndex: action.index }
    case 'clear':
      return {
        ...initialComboboxState,
        open: state.open,
        latestRequest: state.latestRequest + 1,
      }
    default:
      return state
  }
}

/* ------------------------------------------------------------------ *
 * Options shown in the listbox
 * ------------------------------------------------------------------ */

export type ComboboxOption =
  | { kind: 'item'; key: string; href: string; item: SearchItem }
  | { kind: 'recent'; key: string; href: string; recent: RecentSearch }
  | { kind: 'all'; key: string; href: string; query: string }

export interface OptionGroup {
  key: string
  title: string
  options: Array<{ option: ComboboxOption; index: number }>
}

/**
 * The flat list keyboard navigation walks, plus the same options grouped for
 * rendering. Indexes are shared, so `activeIndex` addresses both.
 *
 * - Query too short: recent searches.
 * - Results present: each non-empty group in display order, then a
 *   "see all results" entry leading to the /search page.
 */
export function buildOptions(
  query: string,
  results: SearchResults | null,
  recent: readonly RecentSearch[]
): { flat: ComboboxOption[]; groups: OptionGroup[] } {
  const flat: ComboboxOption[] = []
  const groups: OptionGroup[] = []
  const push = (group: OptionGroup, option: ComboboxOption) => {
    group.options.push({ option, index: flat.length })
    flat.push(option)
  }

  if (!isSearchable(query)) {
    if (recent.length) {
      const group: OptionGroup = { key: 'recent', title: 'Recent searches', options: [] }
      for (const r of recent) push(group, { kind: 'recent', key: `recent:${r.href}`, href: r.href, recent: r })
      groups.push(group)
    }
    return { flat, groups }
  }

  if (!results) return { flat, groups }

  for (const { key, title } of SEARCH_GROUPS) {
    const items = results[key]
    if (!items.length) continue
    const group: OptionGroup = { key, title, options: [] }
    for (const item of items) {
      push(group, { kind: 'item', key: `${item.type}:${item.id}`, href: item.href, item })
    }
    groups.push(group)
  }

  if (flat.length) {
    const group: OptionGroup = { key: 'all', title: '', options: [] }
    push(group, { kind: 'all', key: 'all', href: searchPageHref(results.query), query: results.query })
    groups.push(group)
  }
  return { flat, groups }
}
