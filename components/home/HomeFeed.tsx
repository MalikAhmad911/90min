'use client'

import { useState } from 'react'
import { DateStrip } from './DateStrip'
import { LeagueGroup } from './LeagueGroup'
import { SkeletonMatchCard } from './SkeletonMatchCard'
import { useMatches } from '@/hooks/useMatches'
import { groupByLeague, formatDate } from '@/lib/utils'

export function HomeFeed() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const { matches, isLoading, error } = useMatches(selectedDate)
  const groups = groupByLeague(matches)

  return (
    <div>
      <DateStrip selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {isLoading && (
        <div className="mt-2 bg-bg-surface">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonMatchCard key={i} />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-content-muted">
          <span className="text-4xl mb-3">⚽</span>
          <p className="text-sm">Could not load matches</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {!isLoading && !error && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-content-muted">
          <span className="text-4xl mb-3">⚽</span>
          <p className="text-sm">No matches on this date</p>
        </div>
      )}

      {!isLoading && !error && groups.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {groups.map((group) => (
            <LeagueGroup key={group.competitionId} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
