import Image from 'next/image'
import { MatchCard } from './MatchCard'
import type { GroupedMatches } from '@/lib/types'

interface LeagueGroupProps {
  group: GroupedMatches
}

export function LeagueGroup({ group }: LeagueGroupProps) {
  return (
    <div className="mb-2">
      {/* League header */}
      <div className="flex items-center gap-2.5 px-4 py-2 bg-bg-surface sticky top-14 z-10 border-b border-divider">
        <div className="relative w-5 h-5 shrink-0">
          <Image
            src={group.competitionEmblem}
            alt={group.competitionName}
            fill
            sizes="20px"
            className="object-contain"
          />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-content-muted">
          {group.competitionName}
        </span>
        <span className="ml-auto text-xs text-content-muted">{group.matches.length}</span>
      </div>

      {/* Match cards */}
      <div className="bg-bg-surface">
        {group.matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  )
}
