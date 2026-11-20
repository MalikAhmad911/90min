'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useStandings, useScorers } from '@/hooks/useMatches'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import { Crest } from '@/components/ui/Crest'
import { TeamCrest } from '@/components/ui/TeamCrest'

/**
 * Widgets beside the feed.
 *
 * Everything here used to be hardcoded sample data - invented World Cup
 * groups, invented transfer fees, invented headlines. That is fine in a
 * mock-up and indefensible in something people are meant to trust, so it now
 * reads the same live endpoints the rest of the app does.
 */

const PICKER = ['PL', 'PD', 'BL1', 'SA', 'FL1']

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg-surface rounded-lg overflow-hidden">{children}</div>
}

function Rows({ count }: { count: number }) {
  return (
    <div className="p-3 flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-5 bg-bg-elevated rounded animate-pulse" />
      ))}
    </div>
  )
}

function MiniTable({ code }: { code: string }) {
  const { standings, isLoading, error } = useStandings(code)
  const table = standings.find((t) => t.type === 'TOTAL')?.table ?? []

  if (isLoading && table.length === 0) return <Rows count={6} />
  if (error) {
    return <p className="px-3 py-4 text-[11px] text-content-muted">Table unavailable right now.</p>
  }
  if (table.length === 0) {
    return <p className="px-3 py-4 text-[11px] text-content-muted">No table for this competition.</p>
  }

  return (
    <>
      <div className="grid grid-cols-[1rem_1fr_1.25rem_1.5rem_1.75rem] gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
        <span>#</span>
        <span>Team</span>
        <span className="text-center">PL</span>
        <span className="text-center">GD</span>
        <span className="text-center">PTS</span>
      </div>
      {table.slice(0, 6).map((row) => (
        <Link
          key={row.team.id}
          href={`/team/${row.team.id}`}
          className="grid grid-cols-[1rem_1fr_1.25rem_1.5rem_1.75rem] gap-1 items-center px-3 py-1.5 hover:bg-bg-elevated transition-colors"
        >
          <span className="text-[11px] text-content-muted tabular-nums">{row.position}</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <TeamCrest src={row.team.crest} name={row.team.name} size={14} />
            <span className="text-[12px] text-content-primary font-medium truncate">
              {row.team.shortName || row.team.name}
            </span>
          </span>
          <span className="text-[11px] text-content-muted text-center tabular-nums">
            {row.playedGames}
          </span>
          <span className="text-[11px] text-content-muted text-center tabular-nums">
            {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
          </span>
          <span className="text-[11px] text-content-primary font-bold text-center tabular-nums">
            {row.points}
          </span>
        </Link>
      ))}
    </>
  )
}

function TopScorers({ code }: { code: string }) {
  const { scorers, isLoading, error } = useScorers(code, 5)

  if (isLoading && scorers.length === 0) return <Rows count={4} />
  if (error || scorers.length === 0) {
    return <p className="px-3 py-4 text-[11px] text-content-muted">No scorer data available.</p>
  }

  return (
    <div className="divide-y divide-divider">
      {scorers.slice(0, 5).map((s, i) => (
        <div key={`${s.player.id}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
          <span className="w-3 text-[11px] text-content-muted tabular-nums">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-content-primary font-medium truncate">
              {s.player.name}
            </span>
            <span className="block text-[10px] text-content-muted truncate">
              {s.team.shortName || s.team.name}
            </span>
          </span>
          <span className="text-[12px] font-bold text-accent-green tabular-nums">{s.goals}</span>
        </div>
      ))}
    </div>
  )
}

export function RightSidebar() {
  const [code, setCode] = useState('PL')
  const competition = FREE_COMPETITIONS.find((c) => c.code === code)

  return (
    <div className="py-4 flex flex-col gap-4 px-3">
      {/* Competition picker */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Competition">
        {PICKER.map((c) => {
          const meta = FREE_COMPETITIONS.find((x) => x.code === c)
          if (!meta) return null
          const active = c === code
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCode(c)}
              title={meta.name}
              className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                active ? 'bg-bg-elevated ring-1 ring-accent-green/40' : 'hover:bg-bg-elevated'
              }`}
            >
              <Crest src={meta.emblem} name={meta.name} size={18} fallbackText={meta.flag} />
            </button>
          )
        })}
      </div>

      <SectionCard>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-divider">
          <span className="text-[13px] font-bold text-content-primary truncate">
            {competition?.shortName ?? 'Table'}
          </span>
          <Link
            href={`/leagues/${code}`}
            className="text-[11px] text-accent-green hover:underline shrink-0"
          >
            Full table
          </Link>
        </div>
        <MiniTable code={code} />
      </SectionCard>

      <SectionCard>
        <div className="px-3 py-2.5 border-b border-divider">
          <span className="text-[13px] font-bold text-content-primary">Top scorers</span>
        </div>
        <TopScorers code={code} />
      </SectionCard>
    </div>
  )
}
