'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { FixturesByRound, Fixture } from '@/lib/db/league-queries'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { KickoffTime } from '@/components/player/KickoffTime'
import { isLive } from '@/lib/utils'
import type { MatchStatus } from '@/lib/types'

const fetcher = async (url: string): Promise<FixturesByRound> => {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as FixturesByRound
}

/**
 * Fixtures by round (PRD LG-1).
 *
 * Opens on the season's current matchday (seasons.current_matchday, resolved
 * by the API when no round is asked for) and lets the reader step or jump to
 * any round we hold.
 */
export function FixturesPanel({ code }: { code: string }) {
  // null = "whatever the current round is"; the API resolves it.
  const [selected, setSelected] = useState<number | null>(null)
  const url = `/api/league/${encodeURIComponent(code)}/fixtures${selected ? `?matchday=${selected}` : ''}`

  const { data, error, isLoading } = useSWR<FixturesByRound>(url, fetcher, {
    keepPreviousData: true,
    // Poll only while something in the shown round is live.
    refreshInterval: (latest) =>
      latest?.fixtures?.some((f) => isLive(f.status as MatchStatus)) ? 30_000 : 0,
  })

  const rounds = data?.matchdays ?? []
  const current = data?.matchday ?? null
  const index = current != null ? rounds.indexOf(current) : -1
  const prev = index > 0 ? rounds[index - 1] : null
  const next = index >= 0 && index < rounds.length - 1 ? rounds[index + 1] : null

  if (isLoading && !data) {
    return (
      <div className="p-3 flex flex-col gap-2" aria-busy="true" aria-label="Loading fixtures">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-9 bg-bg-elevated rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (error && !data) return <Message title="Could not load fixtures" hint={error.message} />

  if (!data || rounds.length === 0 || current == null) {
    return (
      <Message
        title="No fixtures by round"
        hint="This competition has no matchday rounds in our data (cups and knockouts are played by stage)."
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-divider">
        <button
          type="button"
          onClick={() => prev != null && setSelected(prev)}
          disabled={prev == null}
          aria-label="Previous matchday"
          className="p-1.5 rounded-md text-content-secondary hover:text-content-primary hover:bg-bg-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft size={16} />
        </button>

        <label className="flex items-center gap-2 text-[12px] text-content-secondary">
          <span className="sr-only">Matchday</span>
          <select
            value={current}
            onChange={(e) => setSelected(Number(e.target.value))}
            className="bg-bg-elevated text-content-primary text-[13px] font-semibold rounded-md px-2 py-1 border border-divider focus:outline-none focus:ring-2 focus:ring-accent-green"
          >
            {rounds.map((r) => (
              <option key={r} value={r}>
                Matchday {r}
                {r === data.currentMatchday ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => next != null && setSelected(next)}
          disabled={next == null}
          aria-label="Next matchday"
          className="p-1.5 rounded-md text-content-secondary hover:text-content-primary hover:bg-bg-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {data.fixtures.length === 0 ? (
        <Message title={`No fixtures stored for matchday ${current}`} />
      ) : (
        <ul className="divide-y divide-divider" aria-live="polite">
          {data.fixtures.map((f) => (
            <li key={f.id}>
              <FixtureRow fixture={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FixtureRow({ fixture: f }: { fixture: Fixture }) {
  const live = isLive(f.status as MatchStatus)
  const played = f.score.home != null && f.score.away != null
  const status =
    f.status === 'POSTPONED' ? 'PPD' : f.status === 'CANCELLED' ? 'CANC' : f.status === 'PAUSED' ? 'HT' : null

  return (
    <Link
      href={`/match/${f.id}`}
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5 hover:bg-bg-elevated transition-colors"
    >
      <span className="flex items-center justify-end gap-2 min-w-0">
        <span className="text-[12px] text-content-primary truncate text-right">{f.homeTeam.shortName}</span>
        <TeamCrest src={f.homeTeam.crest} name={f.homeTeam.name} size={18} />
      </span>
      <span className="min-w-[4.5rem] text-center">
        {played ? (
          <span
            className={`text-[13px] font-bold tabular-nums ${live ? 'text-live-red' : 'text-content-primary'}`}
          >
            {f.score.home} - {f.score.away}
          </span>
        ) : (
          <span className="text-[11px] text-content-secondary tabular-nums">
            <KickoffTime utcDate={f.utcDate} />
          </span>
        )}
        {(status || live) && (
          <span className={`block text-[9px] font-bold ${live ? 'text-live-red' : 'text-content-muted'}`}>
            {status ?? (f.minute != null ? `${f.minute}'` : 'LIVE')}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 min-w-0">
        <TeamCrest src={f.awayTeam.crest} name={f.awayTeam.name} size={18} />
        <span className="text-[12px] text-content-primary truncate">{f.awayTeam.shortName}</span>
      </span>
    </Link>
  )
}

function Message({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[13px] text-content-secondary font-medium">{title}</p>
      {hint && <p className="text-[11px] text-content-muted mt-1">{hint}</p>}
    </div>
  )
}
