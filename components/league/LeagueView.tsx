'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useStandings, useScorers } from '@/hooks/useMatches'
import type { CompetitionMeta } from '@/lib/competitions'
import { Crest } from '@/components/ui/Crest'
import { StandingsTable } from './StandingsTable'
import { FixturesPanel } from './FixturesPanel'
import { LeadersPanel } from './LeadersPanel'
import { FollowButton } from '@/components/follow/FollowButton'
import type { Scorer, StandingsTable as StandingsTableData } from '@/lib/types'

type Tab = 'table' | 'fixtures' | 'scorers' | 'stats'

const TABS: { id: Tab; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'scorers', label: 'Top scorers' },
  { id: 'stats', label: 'Stats' },
]

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 mx-2 mb-3 bg-bg-surface rounded-lg overflow-hidden">{children}</div>
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[13px] text-content-secondary font-medium">{title}</p>
      {hint && <p className="text-[11px] text-content-muted mt-1">{hint}</p>}
    </div>
  )
}

function Loading() {
  return (
    <div className="p-3 flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-7 bg-bg-elevated rounded animate-pulse" />
      ))}
    </div>
  )
}

function ScorersPanel({ code, initial }: { code: string; initial?: Scorer[] }) {
  const { scorers, error, isLoading } = useScorers(code, 20, initial)

  if (isLoading && scorers.length === 0) return <Loading />
  // Keep server-rendered scorers on screen if a later refresh fails.
  if (error && scorers.length === 0) return <Empty title="Could not load top scorers" hint={error} />
  if (scorers.length === 0) {
    return (
      <Empty
        title="No scorer data"
        hint="Top scorers are not published for every competition on this plan."
      />
    )
  }

  return (
    <div className="divide-y divide-divider">
      <div className="grid grid-cols-[1.25rem_1fr_2rem_2rem] gap-2 px-3 py-1.5 border-b border-divider">
        <span className="text-[10px] font-bold uppercase text-content-muted">#</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">
          Player
        </span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center">G</span>
        <span className="text-[10px] font-bold uppercase text-content-muted text-center">A</span>
      </div>
      {scorers.map((s, i) => (
        <div key={`${s.player.id}-${i}`} className="grid grid-cols-[1.25rem_1fr_2rem_2rem] gap-2 px-3 py-2 items-center">
          <span className="text-[11px] text-content-muted tabular-nums">{i + 1}</span>
          <span className="min-w-0">
            <Link
              href={`/team/${s.team.id}`}
              className="block text-[12px] text-content-primary truncate hover:text-accent-green transition-colors"
            >
              {s.player.name}
            </Link>
            <span className="block text-[10px] text-content-muted truncate">
              {s.team.shortName || s.team.name}
            </span>
          </span>
          <span className="text-[12px] font-bold text-content-primary text-center tabular-nums">
            {s.goals}
          </span>
          <span className="text-[12px] text-content-secondary text-center tabular-nums">
            {s.assists ?? '-'}
          </span>
        </div>
      ))}
    </div>
  )
}

function TablePanel({ code, initial }: { code: string; initial?: StandingsTableData[] }) {
  const { standings, error, isLoading } = useStandings(code, initial)

  if (isLoading && standings.length === 0) return <Loading />
  // Keep a server-rendered table on screen if a later refresh fails.
  if (error && standings.length === 0) return <Empty title="Could not load the table" hint={error} />

  // Cups publish several tables (TOTAL plus HOME/AWAY splits) - show the
  // overall ones only, which is what a league ladder means to a reader.
  const tables = standings.filter((t) => t.type === 'TOTAL' || standings.length === 1)

  if (tables.length === 0) {
    return (
      <Empty
        title="No table available"
        hint="Knockout rounds and some cups have no league table."
      />
    )
  }

  return (
    <div className="divide-y divide-divider">
      {tables.map((t, i) => (
        <StandingsTable key={`${t.stage}-${t.group ?? i}`} table={t} showGroup={tables.length > 1} competitionCode={code} />
      ))}
    </div>
  )
}

export function LeagueView({
  competition,
  initialStandings,
  initialScorers,
}: {
  competition: CompetitionMeta
  /**
   * Server-rendered data. Passed only when non-empty: an empty table may just
   * mean "not synced yet", and the API's first fetch is what fills it, so the
   * view should show its loading state rather than a premature "no table".
   */
  initialStandings?: StandingsTableData[]
  initialScorers?: Scorer[]
}) {
  const [tab, setTab] = useState<Tab>('table')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-divider">
        <Link
          href="/leagues"
          aria-label="All leagues"
          className="p-1 -ml-1 rounded-md text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <Crest
          src={competition.emblem}
          name={competition.name}
          size={28}
          fallbackText={competition.flag}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-content-primary truncate">
            {competition.name}
          </h1>
          <p className="text-[11px] text-content-muted">
            {competition.flag} {competition.country}
          </p>
        </div>
        <FollowButton
          entityType="competition"
          entityKey={competition.code}
          name={competition.name}
          showLabel
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-divider overflow-x-auto scrollbar-hide">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              tab === id
                ? 'bg-accent-green text-bg-primary font-semibold'
                : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Panel>
        {tab === 'table' && <TablePanel code={competition.code} initial={initialStandings} />}
        {tab === 'fixtures' && <FixturesPanel code={competition.code} />}
        {tab === 'scorers' && <ScorersPanel code={competition.code} initial={initialScorers} />}
        {tab === 'stats' && <LeadersPanel code={competition.code} />}
      </Panel>
    </div>
  )
}
