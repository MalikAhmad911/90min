/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server'
import type { StandingsTable } from '@/lib/types'

const table: StandingsTable = { stage: 'REGULAR_SEASON', type: 'TOTAL', group: null, table: [] }

// vi.mock factories are hoisted above the imports, so the mock must be too.
const { getStandingsView } = vi.hoisted(() => ({
  getStandingsView: vi.fn(async (_code: string, view?: string) => [
    { stage: 'REGULAR_SEASON', type: String(view).toUpperCase(), group: null, table: [] },
  ]),
}))

vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => true, getDb: vi.fn() }))
vi.mock('@/lib/db/standings-view', () => ({ getStandingsView }))
vi.mock('@/lib/server/read-through', () => ({ ensureFresh: vi.fn(async () => undefined) }))
vi.mock('@/lib/api/football-data', () => ({ fetchStandings: vi.fn() }))

async function get(query: string) {
  const { GET } = await import('@/app/api/standings/route')
  const res = await GET(new NextRequest(`http://localhost/api/standings?${query}`))
  return { status: res.status, body: await res.json() }
}

beforeEach(() => getStandingsView.mockClear())

describe('GET /api/standings', () => {
  it('keeps the default response shape and reads the overall view', async () => {
    const { status, body } = await get('competition=PL')
    expect(status).toBe(200)
    expect(getStandingsView).toHaveBeenCalledWith('PL', 'total')
    expect(body).toEqual({ competition: { code: 'PL' }, standings: [{ ...table, type: 'TOTAL' }], source: 'database' })
  })

  it('serves the home and away views', async () => {
    const home = await get('competition=PL&view=home')
    expect(getStandingsView).toHaveBeenLastCalledWith('PL', 'home')
    expect(home.body).toMatchObject({ view: 'home', standings: [{ type: 'HOME' }] })

    await get('competition=PL&view=away')
    expect(getStandingsView).toHaveBeenLastCalledWith('PL', 'away')
  })

  it('refuses a view outside the allow-list', async () => {
    const { status, body } = await get('competition=PL&view=form')
    expect(status).toBe(400)
    expect(body.allowed).toEqual(['total', 'home', 'away'])
    expect(getStandingsView).not.toHaveBeenCalled()
  })

  it('still refuses an unknown competition', async () => {
    const { status } = await get('competition=XX&view=home')
    expect(status).toBe(400)
  })
})
