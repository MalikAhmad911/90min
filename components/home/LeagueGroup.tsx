'use client'

import { useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { MatchCard } from './MatchCard'
import { Crest } from '@/components/ui/Crest'
import type { GroupedMatches, Match } from '@/lib/types'

function formatGroupLabel(group?: string): string | null {
  if (!group) return null
  return group.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function groupMatchesByStage(matches: Match[]): { label: string | null; matches: Match[] }[] {
  const groups: { label: string | null; matches: Match[] }[] = []
  let currentLabel: string | null = undefined as unknown as null
  let currentGroup: Match[] = []

  for (const match of matches) {
    const label = formatGroupLabel(match.group)
    if (label !== currentLabel) {
      if (currentGroup.length > 0) groups.push({ label: currentLabel, matches: currentGroup })
      currentLabel = label
      currentGroup = [match]
    } else {
      currentGroup.push(match)
    }
  }
  if (currentGroup.length > 0) groups.push({ label: currentLabel, matches: currentGroup })

  return groups
}

export function LeagueGroup({ group }: { group: GroupedMatches }) {
  const [expanded, setExpanded] = useState(true)
  const subGroups = groupMatchesByStage(group.matches)

  return (
    <div className="bg-bg-surface rounded-lg overflow-hidden">
      {/* Competition header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-bg-elevated transition-colors"
      >
        <Crest src={group.competitionEmblem} name={group.competitionName} size={20} />
        <span className="text-[13px] font-semibold text-content-primary flex-1 text-left">
          {group.competitionName}
        </span>
        <ChevronUp
          size={15}
          className={`text-content-muted transition-transform duration-200 ${expanded ? 'rotate-0' : 'rotate-180'}`}
        />
      </button>

      {/* Matches, optionally with group sub-headers */}
      {expanded && (
        <div className="border-t border-divider">
          {subGroups.map((sg, i) => (
            <div key={i}>
              {sg.label && (
                <div className="px-4 pt-2 pb-0.5">
                  <span className="text-[11px] font-semibold text-content-muted uppercase tracking-wider">
                    {sg.label}
                  </span>
                </div>
              )}
              <div>
                {sg.matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
