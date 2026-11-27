import {
  buildOptions,
  comboboxReducer,
  initialComboboxState,
  type ComboboxState,
} from '@/components/search/combobox-state'
import type { SearchItem, SearchResults } from '@/components/search/types'
import type { RecentSearch } from '@/components/search/recent-searches'

const team = (id: number, label: string): SearchItem => ({
  type: 'team',
  id: String(id),
  label,
  sublabel: 'Premier League',
  image: null,
  href: `/team/${id}`,
})

const results = (query: string, teams: SearchItem[] = [], competitions: SearchItem[] = []): SearchResults => ({
  query,
  teams,
  competitions,
  players: [],
  matches: [],
})

const typed = (query: string, from: ComboboxState = initialComboboxState) =>
  comboboxReducer(from, { type: 'input', query })

describe('comboboxReducer', () => {
  it('opens on input and resets the highlight', () => {
    const s = typed('liv', { ...initialComboboxState, activeIndex: 3 })
    expect(s).toMatchObject({ query: 'liv', open: true, activeIndex: -1 })
  })

  it('applies the newest response', () => {
    let s = typed('liv')
    s = comboboxReducer(s, { type: 'request', id: 1 })
    expect(s.status).toBe('loading')
    s = comboboxReducer(s, { type: 'success', id: 1, results: results('liv', [team(64, 'Liverpool FC')]) })
    expect(s.status).toBe('success')
    expect(s.results?.teams[0].label).toBe('Liverpool FC')
  })

  it('ignores a stale response that arrives after a newer request started', () => {
    let s = typed('li')
    s = comboboxReducer(s, { type: 'request', id: 1 })
    s = typed('liv', s)
    s = comboboxReducer(s, { type: 'request', id: 2 })
    const stale = comboboxReducer(s, { type: 'success', id: 1, results: results('li', [team(1, 'Lille')]) })
    expect(stale).toBe(s)
    const staleError = comboboxReducer(s, { type: 'failure', id: 1 })
    expect(staleError).toBe(s)
  })

  it('drops results and invalidates in-flight requests when the query becomes too short', () => {
    let s = typed('liv')
    s = comboboxReducer(s, { type: 'request', id: 1 })
    s = comboboxReducer(s, { type: 'success', id: 1, results: results('liv', [team(64, 'Liverpool FC')]) })
    s = comboboxReducer(s, { type: 'request', id: 2 })
    s = typed('l', s)
    expect(s.results).toBeNull()
    expect(s.status).toBe('idle')
    expect(comboboxReducer(s, { type: 'success', id: 2, results: results('li') })).toBe(s)
  })

  it('keeps previous results visible while the next request loads', () => {
    let s = typed('liv')
    s = comboboxReducer(s, { type: 'request', id: 1 })
    s = comboboxReducer(s, { type: 'success', id: 1, results: results('liv', [team(64, 'Liverpool FC')]) })
    s = typed('live', s)
    s = comboboxReducer(s, { type: 'request', id: 2 })
    expect(s.status).toBe('loading')
    expect(s.results).not.toBeNull()
  })

  it('records an error for the current request', () => {
    let s = typed('liv')
    s = comboboxReducer(s, { type: 'request', id: 1 })
    s = comboboxReducer(s, { type: 'failure', id: 1 })
    expect(s.status).toBe('error')
  })

  describe('move', () => {
    const open: ComboboxState = { ...initialComboboxState, open: true }

    it('ArrowDown from nothing highlights the first option, ArrowUp the last', () => {
      expect(comboboxReducer(open, { type: 'move', delta: 1, count: 4 }).activeIndex).toBe(0)
      expect(comboboxReducer(open, { type: 'move', delta: -1, count: 4 }).activeIndex).toBe(3)
    })

    it('wraps around at both ends', () => {
      expect(comboboxReducer({ ...open, activeIndex: 3 }, { type: 'move', delta: 1, count: 4 }).activeIndex).toBe(0)
      expect(comboboxReducer({ ...open, activeIndex: 0 }, { type: 'move', delta: -1, count: 4 }).activeIndex).toBe(3)
    })

    it('opens a closed box', () => {
      const s = comboboxReducer(initialComboboxState, { type: 'move', delta: 1, count: 2 })
      expect(s).toMatchObject({ open: true, activeIndex: 0 })
    })

    it('does nothing useful with no options', () => {
      expect(comboboxReducer({ ...open, activeIndex: 2 }, { type: 'move', delta: 1, count: 0 }).activeIndex).toBe(-1)
    })
  })

  it('close clears the highlight; hover sets it without re-rendering when unchanged', () => {
    const s = { ...initialComboboxState, open: true, activeIndex: 2 }
    expect(comboboxReducer(s, { type: 'close' })).toMatchObject({ open: false, activeIndex: -1 })
    expect(comboboxReducer(s, { type: 'hover', index: 2 })).toBe(s)
    expect(comboboxReducer(s, { type: 'hover', index: 0 }).activeIndex).toBe(0)
  })

  it('clear empties the query and invalidates in-flight requests', () => {
    let s = typed('liv')
    s = comboboxReducer(s, { type: 'request', id: 5 })
    s = comboboxReducer(s, { type: 'clear' })
    expect(s.query).toBe('')
    expect(comboboxReducer(s, { type: 'success', id: 5, results: results('liv') })).toBe(s)
  })
})

describe('buildOptions', () => {
  const recent: RecentSearch[] = [
    { type: 'team', label: 'Arsenal FC', href: '/team/57' },
    { type: 'query', label: 'premier', href: '/search?q=premier' },
  ]

  it('shows recent searches while the query is too short', () => {
    const { flat, groups } = buildOptions('a', null, recent)
    expect(flat.map((o) => o.href)).toEqual(['/team/57', '/search?q=premier'])
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Recent searches')
  })

  it('shows nothing for a short query with no history', () => {
    expect(buildOptions('', null, []).flat).toEqual([])
  })

  it('flattens groups in display order and appends "see all"', () => {
    const r = results('li', [team(64, 'Liverpool FC')], [
      { type: 'competition', id: 'L1', label: 'Ligue 1', sublabel: 'France', image: null, href: '/leagues/FL1' },
    ])
    const { flat, groups } = buildOptions('li', r, recent)
    expect(flat.map((o) => o.kind)).toEqual(['item', 'item', 'all'])
    expect(flat[2].href).toBe('/search?q=li')
    expect(groups.map((g) => g.key)).toEqual(['teams', 'competitions', 'all'])
    // Indexes are shared between the grouped and the flat view.
    expect(groups[1].options[0].index).toBe(1)
    expect(groups[2].options[0].index).toBe(2)
  })

  it('offers no "see all" when there are no results', () => {
    expect(buildOptions('zzz', results('zzz'), recent).flat).toEqual([])
  })
})
