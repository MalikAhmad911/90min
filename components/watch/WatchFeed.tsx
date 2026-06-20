'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Tv } from 'lucide-react'
import { DateNav } from '@/components/home/DateNav'
import { SkeletonMatchCard } from '@/components/home/SkeletonMatchCard'
import { CountryPicker } from './CountryPicker'
import { WatchMatchRow } from './WatchMatchRow'
import { useMatches } from '@/hooks/useMatches'
import { useCountry } from '@/hooks/useCountry'
import { useStreamOverrides } from '@/hooks/useStreamOverrides'
import { groupByLeague, formatDate } from '@/lib/utils'

export function WatchFeed() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [country, setCountry] = useCountry()
  const overrides = useStreamOverrides()
  const { matches, isLoading, error } = useMatches(selectedDate)
  const groups = groupByLeague(matches)

  return (
    <div>
      <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Header: title + country picker */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-divider">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-content-primary">
          <Tv size={15} className="text-accent-green" />
          Where to watch
        </div>
        <CountryPicker country={country} onChange={setCountry} />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2 mt-2 px-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-bg-surface rounded-lg overflow-hidden">
              <div className="h-9 bg-bg-elevated mx-4 my-2 rounded animate-pulse" />
              {Array.from({ length: 2 }).map((_, j) => (
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
          <span className="text-3xl mb-3">📺</span>
          <p className="text-sm font-medium text-content-secondary">No matches on this date</p>
        </div>
      )}

      {/* League groups */}
      {!isLoading && !error && groups.length > 0 && (
        <div className="flex flex-col gap-2 mt-2 px-2 pb-3">
          {groups.map((group) => (
            <div key={group.competitionId} className="bg-bg-surface rounded-lg overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                {group.competitionEmblem ? (
                  <div className="relative w-5 h-5 shrink-0">
                    <Image
                      src={group.competitionEmblem}
                      alt={group.competitionName}
                      fill
                      sizes="20px"
                      className="object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                    />
                  </div>
                ) : (
                  <div className="w-5 h-5 shrink-0 rounded-sm bg-bg-elevated" />
                )}
                <span className="text-[13px] font-semibold text-content-primary">{group.competitionName}</span>
              </div>
              <div className="border-t border-divider divide-y divide-divider">
                {group.matches.map((match) => (
                  <WatchMatchRow key={match.id} match={match} country={country} overrides={overrides} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
