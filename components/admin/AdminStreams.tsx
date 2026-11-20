'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { LogOut, Tv } from 'lucide-react'
import { DateNav } from '@/components/home/DateNav'
import { useMatches } from '@/hooks/useMatches'
import { groupByLeague, formatDate } from '@/lib/utils'
import { COMPETITIONS } from '@/lib/tv/broadcasters'
import { StreamEditor } from './StreamEditor'
import { ChannelManager } from './ChannelManager'
import type { StreamOverrides } from '@/lib/tv/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const EMPTY: StreamOverrides = { byMatch: {}, byCompetition: {} }

export function AdminStreams({ username }: { username: string }) {
  const [date, setDate] = useState(formatDate(new Date()))
  const { matches, isLoading } = useMatches(date)
  const { data: overrides = EMPTY, mutate } = useSWR<StreamOverrides>('/api/streams', fetcher)

  const groups = groupByLeague(matches)

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.assign('/login')
  }

  const onSaved = (next: unknown) => mutate(next as StreamOverrides, { revalidate: false })

  return (
    <div className="px-3 py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4 px-1">
        <div>
          <h1 className="text-lg font-bold text-content-primary flex items-center gap-2">
            <Tv size={18} className="text-accent-green" /> Stream manager
          </h1>
          <p className="text-[12px] text-content-muted mt-0.5">
            Signed in as {username}. Add official/legal streams per match or per competition.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated text-content-secondary text-[13px] hover:text-content-primary shrink-0"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {/* Live TV channels — standalone, play directly */}
      <ChannelManager />

      {/* Competition-level defaults — always available */}
      <div className="bg-bg-surface border border-divider rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-2.5 border-b border-divider">
          <span className="text-[13px] font-semibold text-content-primary">Competition defaults</span>
          <p className="text-[11px] text-content-muted mt-0.5">
            Applies to every match in that league (unless a match has its own stream below).
          </p>
        </div>
        <div className="divide-y divide-divider">
          {COMPETITIONS.map((c) => (
            <div key={c.code} className="px-4 py-2.5">
              <p className="text-[13px] text-content-primary font-medium">
                {c.name} <span className="text-content-muted text-[11px]">({c.code})</span>
              </p>
              <StreamEditor
                scope="competition"
                storeKey={c.code}
                current={overrides.byCompetition[c.code]}
                onSaved={onSaved}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-match streams — pick a date with matches */}
      <div className="bg-bg-surface border border-divider rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-divider">
          <span className="text-[13px] font-semibold text-content-primary">Per-match streams</span>
        </div>
        <DateNav selectedDate={date} onDateChange={setDate} />

        {isLoading && <p className="text-sm text-content-muted px-4 py-3">Loading matches…</p>}
        {!isLoading && groups.length === 0 && (
          <p className="text-sm text-content-muted px-4 py-3">
            No matches on this date — use the arrows above to pick another day, or set a competition default.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.competitionId}>
            <div className="px-4 py-2 bg-bg-elevated/40">
              <span className="text-[12px] font-semibold text-content-secondary">{group.competitionName}</span>
            </div>
            <div className="divide-y divide-divider">
              {group.matches.map((m) => (
                <div key={m.id} className="px-4 py-2.5">
                  <p className="text-[13px] text-content-primary font-medium">
                    {m.homeTeam.shortName || m.homeTeam.name} <span className="text-content-muted">vs</span>{' '}
                    {m.awayTeam.shortName || m.awayTeam.name}
                  </p>
                  <StreamEditor
                    scope="match"
                    storeKey={String(m.id)}
                    current={overrides.byMatch[String(m.id)]}
                    onSaved={onSaved}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
