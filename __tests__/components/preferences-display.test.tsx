import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { KickoffTime } from '@/components/player/KickoffTime'
import { Crest } from '@/components/ui/Crest'
import { StandingsTable } from '@/components/league/StandingsTable'
import { LITE_MODE_STORAGE_KEY } from '@/hooks/useLiteMode'
import { TIME_FORMAT_STORAGE_KEY } from '@/lib/i18n/time-format'
import { TIMEZONE_STORAGE_KEY, setPreferredTimeZone } from '@/lib/timezone'
import type { StandingsTable as StandingsTableData } from '@/lib/types'

/**
 * Settings that only exist in the browser (time zone, 12h/24h, Lite mode)
 * must change what is shown - with no <LocaleProvider> mounted, as on every
 * page but Settings - while the server render stays preference-free.
 */

// 20:45 UTC on Fri 20 Nov = 01:45 on Sat 21 Nov in Karachi.
const KICKOFF = '2026-11-20T20:45:00Z'

afterEach(() => {
  window.localStorage.clear()
})

describe('KickoffTime', () => {
  it('server-renders UTC on a 24-hour clock whatever is stored', () => {
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, 'Asia/Karachi')
    window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, '12h')
    const html = renderToString(<KickoffTime utcDate={KICKOFF} />)
    expect(html).toContain('Fri 20 Nov, 20:45 UTC')
  })

  it('uses the stored zone and 12-hour clock without a LocaleProvider', () => {
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, 'Asia/Karachi')
    window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, '12h')
    render(<KickoffTime utcDate={KICKOFF} />)
    expect(screen.getByText(/^Sat 21 Nov, 01:45\s?am$/i)).toBeInTheDocument()
  })

  it('follows a zone change made in Settings without a reload', () => {
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, 'UTC')
    render(<KickoffTime utcDate={KICKOFF} />)
    expect(screen.getByText('Fri 20 Nov, 20:45')).toBeInTheDocument()

    act(() => setPreferredTimeZone('Asia/Karachi'))
    expect(screen.getByText('Sat 21 Nov, 01:45')).toBeInTheDocument()
  })
})

describe('Crest in Lite mode', () => {
  it('shows the image normally', () => {
    const { container } = render(<Crest src="https://crests.football-data.org/57.png" name="Arsenal FC" />)
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('shows initials without requesting the image when Lite mode is on', () => {
    window.localStorage.setItem(LITE_MODE_STORAGE_KEY, 'on')
    const { container } = render(<Crest src="https://crests.football-data.org/57.png" name="Arsenal FC" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('still server-renders the image, so hydration matches', () => {
    window.localStorage.setItem(LITE_MODE_STORAGE_KEY, 'on')
    const html = renderToString(<Crest src="https://crests.football-data.org/57.png" name="Arsenal FC" />)
    expect(html).toContain('<img')
  })
})

describe('StandingsTable form column', () => {
  const row = (position: number, id: number, name: string, form: string | null) => ({
    position,
    team: { id, name, shortName: name, tla: '', crest: '' },
    playedGames: 3,
    form,
    won: 0,
    draw: 0,
    lost: 0,
    points: 9 - position,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  })

  it('draws one pill per result, most recent last, with a text alternative', () => {
    const table: StandingsTableData = {
      stage: 'REGULAR_SEASON',
      type: 'TOTAL',
      group: null,
      table: [row(1, 57, 'Arsenal', 'W,D,L'), row(2, 61, 'Chelsea', null)],
    }
    render(<StandingsTable table={table} />)
    expect(screen.getByText('Form')).toBeInTheDocument()
    expect(screen.getByText('Form, oldest to newest: win, draw, loss')).toBeInTheDocument()
  })

  it('has no Form column when no row has a form', () => {
    const table: StandingsTableData = {
      stage: 'REGULAR_SEASON',
      type: 'HOME',
      group: null,
      table: [row(1, 57, 'Arsenal', null)],
    }
    render(<StandingsTable table={table} competitionCode="PL" />)
    expect(screen.queryByText('Form')).not.toBeInTheDocument()
    // Zones belong to the overall table only.
    expect(screen.queryByLabelText('Table zones')).not.toBeInTheDocument()
  })
})
