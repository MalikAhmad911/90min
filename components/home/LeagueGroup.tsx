'use client'

import { useId, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { MatchCard } from './MatchCard'
import { Crest } from '@/components/ui/Crest'
import { FollowButton } from '@/components/follow/FollowButton'
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

interface LeagueGroupProps {
  group: GroupedMatches
  /** Competition code; enables the follow star when given. */
  code?: string
  /** Controlled collapse (remembered by the feed). Uncontrolled when omitted. */
  collapsed?: boolean
  onToggle?: () => void
  timeZone?: string | null
}

export function LeagueGroup({ group, code, collapsed, onToggle, timeZone }: LeagueGroupProps) {
  const [localExpanded, setLocalExpanded] = useState(true)
  const expanded = collapsed === undefined ? localExpanded : !collapsed
  const toggle = onToggle ?? (() => setLocalExpanded((v) => !v))
  const bodyId = useId()
  const subGroups = groupMatchesByStage(group.matches)

  return (
    <section className="bg-bg-surface rounded-lg overflow-hidden" aria-label={group.competitionName}>
      {/* Competition header: the toggle and the star are siblings, never nested buttons. */}
      <div className="flex items-center pr-2 hover:bg-bg-elevated transition-colors">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="flex-1 min-w-0 flex items-center gap-2.5 pl-4 pr-2 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green"
        >
          <Crest src={group.competitionEmblem} name={group.competitionName} size={20} />
          <span className="text-[13px] font-semibold text-content-primary flex-1 text-left truncate">
            {group.competitionName}
          </span>
          {!expanded && (
            <span className="text-[11px] text-content-muted tabular-nums">{group.matches.length}</span>
          )}
          <ChevronUp
            size={15}
            aria-hidden="true"
            className={`text-content-muted transition-transform duration-200 ${expanded ? 'rotate-0' : 'rotate-180'}`}
          />
        </button>
        {code && (
          <FollowButton entityType="competition" entityKey={code} name={group.competitionName} size="sm" />
        )}
      </div>

      {/* Matches, optionally with group sub-headers */}
      {expanded && (
        <div id={bodyId} className="border-t border-divider">
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
                  <MatchCard key={match.id} match={match} timeZone={timeZone} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
