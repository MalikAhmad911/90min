'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { LogOut, Tv } from 'lucide-react'
import { useMatches } from '@/hooks/useMatches'
import { groupByLeague, formatDate } from '@/lib/utils'
import { StreamEditor } from './StreamEditor'
import type { StreamOverrides } from '@/lib/tv/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const EMPTY: StreamOverrides = { byMatch: {}, byCompetition: {} }

export function AdminStreams({ username }: { username: string }) {
  const router = useRouter()
  const [date] = useState(formatDate(new Date()))
  const { matches, isLoading } = useMatches(date)
  const { data: overrides = EMPTY, mutate } = useSWR<StreamOverrides>('/api/streams', fetcher)

  const groups = groupByLeague(matches)

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated text-content-secondary text-[13px] hover:text-content-primary"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {isLoading && <p className="text-sm text-content-muted px-1">Loading today’s matches…</p>}
      {!isLoading && groups.length === 0 && (
        <p className="text-sm text-content-muted px-1">No matches today.</p>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => {
          const code = group.matches[0]?.competition.code ?? ''
          return (
            <div key={group.competitionId} className="bg-bg-surface border border-divider rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-divider">
                <span className="text-[13px] font-semibold text-content-primary">{group.competitionName}</span>
                <div className="mt-1">
                  <p className="text-[11px] text-content-muted uppercase tracking-wider">
                    Competition default ({code})
                  </p>
                  <StreamEditor
                    scope="competition"
                    storeKey={code}
                    current={overrides.byCompetition[code]}
                    onSaved={onSaved}
                  />
                </div>
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
          )
        })}
      </div>
    </div>
  )
}
