import { buildTransfers, type RawRow } from '@/lib/transfers/recent'
import { CLUB_QIDS } from '@/lib/transfers/club-qids'

const E = (q: string) => `http://www.wikidata.org/entity/${q}`
const club = CLUB_QIDS[0]
const other = CLUB_QIDS[1]

describe('buildTransfers', () => {
  it('builds one transfer per move and picks the latest previous club', () => {
    const rows: RawRow[] = [
      {
        player: E('Q1'), playerName: 'Player One', club: E(club.qid), start: '2026-08-01T00:00:00Z',
        prev: E('Q900'), prevName: 'Old Club', prevEnd: '2025-06-30T00:00:00Z',
      },
      {
        player: E('Q1'), playerName: 'Player One', club: E(club.qid), start: '2026-08-01T00:00:00Z',
        prev: E(other.qid), prevName: 'Recent Club', prevEnd: '2026-07-31T00:00:00Z',
      },
    ]
    const [t, ...rest] = buildTransfers(rows)
    expect(rest).toHaveLength(0)
    expect(t.toTeamId).toBe(club.teamId)
    expect(t.fromName).toBe('Recent Club')
    expect(t.fromTeamId).toBe(other.teamId)
    expect(t.date).toBe('2026-08-01')
    expect(t.loan).toBe(false)
  })

  it('flags loans and ignores unknown clubs and unlabelled players', () => {
    const out = buildTransfers([
      { player: E('Q2'), playerName: 'Loanee', club: E(club.qid), start: '2026-09-01T00:00:00Z', acqName: 'loan' },
      { player: E('Q3'), playerName: 'Nobody', club: E('Q123456789'), start: '2026-09-01T00:00:00Z' },
      { player: E('Q4'), playerName: 'Q4', club: E(club.qid), start: '2026-09-01T00:00:00Z' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].loan).toBe(true)
    expect(out[0].fromName).toBeNull()
  })

  it('ignores a "previous" club that ended after the move', () => {
    const [t] = buildTransfers([
      {
        player: E('Q5'), playerName: 'Late', club: E(club.qid), start: '2026-08-01T00:00:00Z',
        prev: E('Q901'), prevName: 'Later Club', prevEnd: '2026-12-01T00:00:00Z',
      },
    ])
    expect(t.fromName).toBeNull()
  })

  it('sorts newest first', () => {
    const out = buildTransfers([
      { player: E('Q6'), playerName: 'A', club: E(club.qid), start: '2026-07-01T00:00:00Z' },
      { player: E('Q7'), playerName: 'B', club: E(club.qid), start: '2026-09-01T00:00:00Z' },
    ])
    expect(out.map((t) => t.playerName)).toEqual(['B', 'A'])
  })
})
