'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { DateNav } from './DateNav'
import { LeagueGroup } from './LeagueGroup'
import { SkeletonMatchCard } from './SkeletonMatchCard'
import { useMatches } from '@/hooks/useMatches'
import { groupByLeague, formatDate } from '@/lib/utils'
import type { Match } from '@/lib/types'

type Filter = 'All' | 'Ongoing' | 'Finished' | 'Scheduled'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'Ongoing', label: 'Ongoing' },
  { id: 'Finished', label: 'Finished' },
  { id: 'Scheduled', label: 'By time' },
]

function applyFilter(matches: Match[], filter: Filter): Match[] {
  if (filter === 'Ongoing') return matches.filter((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
  if (filter === 'Finished') return matches.filter((m) => m.status === 'FINISHED')
  if (filter === 'Scheduled') return matches.filter((m) => m.status === 'SCHEDULED' || m.status === 'TIMED')
  return matches
}

export function HomeFeed() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [filter, setFilter] = useState<Filter>('All')
  const { matches, isLoading, error } = useMatches(selectedDate)

  const liveCount = matches.filter((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED').length
  const filtered = applyFilter(matches, filter)
  const groups = groupByLeague(filtered)

  return (
    <div>
      {/* FotMob-style date nav: < Today > */}
      <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Filter tabs: Ongoing | On TV | By time | Filter */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-divider overflow-x-auto scrollbar-hide">
        {/* All = default, no tab */}
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter((prev) => prev === id ? 'All' : id)}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              filter === id
                ? 'bg-accent-green text-bg-primary font-semibold'
                : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
            }`}
          >
            {label}
            {id === 'Ongoing' && liveCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-live-red text-white text-[9px] font-black">
                {liveCount}
              </span>
            )}
          </button>
        ))}

        {/* Filter icon button */}
        <button
          type="button"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors ml-auto"
        >
          <SlidersHorizontal size={13} />
          Filter
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2 mt-2 px-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-bg-surface rounded-lg overflow-hidden">
              <div className="h-9 bg-bg-elevated mx-4 my-2 rounded animate-pulse" />
              {Array.from({ length: 3 }).map((_, j) => (
                <SkeletonMatchCard key={j} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-content-muted">
          <p className="text-sm font-medium text-content-secondary">Could not load matches</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-content-muted">
          <span className="text-3xl mb-3">⚽</span>
          <p className="text-sm font-medium text-content-secondary">
            {filter === 'All' ? 'No matches on this date' : `No ${filter.toLowerCase()} matches`}
          </p>
        </div>
      )}

      {/* League groups */}
      {!isLoading && !error && groups.length > 0 && (
        <div className="flex flex-col gap-2 mt-2 px-2 pb-3">
          {groups.map((group) => (
            <LeagueGroup key={group.competitionId} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
