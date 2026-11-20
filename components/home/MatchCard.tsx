'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { isLive, formatKickoffTime } from '@/lib/utils'
import type { Match } from '@/lib/types'

/**
 * Flashes once when the scoreline changes between polls - the goal moment is
 * the one thing a live score app must not let you scroll past. Deliberately
 * does not fire on first render, or every card would pop on page load.
 */
function useScoreFlash(home: number | null, away: number | null): boolean {
  const previous = useRef<string | null>(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const current = `${home}-${away}`
    const hadPrevious = previous.current !== null
    const changed = previous.current !== current
    previous.current = current

    if (!hadPrevious || !changed) return

    setFlash(true)
    const timer = setTimeout(() => setFlash(false), 450)
    return () => clearTimeout(timer)
  }, [home, away])

  return flash
}

function StatusLabel({ match }: { match: Match }) {
  const isPaused = match.status === 'PAUSED'
  const live = isLive(match.status) && !isPaused

  if (match.status === 'FINISHED') {
    return <span className="text-[11px] text-content-muted font-medium">FT</span>
  }
  if (isPaused) {
    return <span className="text-[11px] text-accent-green font-bold">HT</span>
  }
  if (live) {
    return (
      <span className="text-[11px] text-live-red font-bold tabular-nums">
        {match.minute ?? '?'}&apos;
      </span>
    )
  }
  return null
}

function CenterDisplay({ match }: { match: Match }) {
  const isPaused = match.status === 'PAUSED'
  const live = isLive(match.status) && !isPaused
  const isScheduled = match.status === 'SCHEDULED' || match.status === 'TIMED'
  const { home, away } = match.score.fullTime
  const flash = useScoreFlash(home, away)

  if (isScheduled) {
    return (
      <span className="text-[13px] font-semibold text-content-secondary tabular-nums">
        {formatKickoffTime(match.utcDate)}
      </span>
    )
  }

  const scoreColor = live ? 'text-live-red' : 'text-content-primary'

  return (
    <span
      className={`text-[15px] font-black tabular-nums tracking-tight ${scoreColor} ${
        flash ? 'animate-score-pop' : ''
      }`}
    >
      {home ?? '-'}&nbsp;-&nbsp;{away ?? '-'}
    </span>
  )
}

export function MatchCard({ match }: { match: Match }) {
  const winner = match.status === 'FINISHED'
    ? match.score.fullTime.home !== null && match.score.fullTime.away !== null
      ? match.score.fullTime.home > match.score.fullTime.away ? 'home'
        : match.score.fullTime.away > match.score.fullTime.home ? 'away'
        : 'draw'
      : null
    : null

  const homeDim = winner === 'away'
  const awayDim = winner === 'home'

  return (
    <Link
      href={`/match/${match.id}`}
      className="flex items-center px-3 sm:px-4 py-2.5 hover:bg-bg-elevated transition-colors gap-2"
    >
      {/* Status: FT / HT / live minute — left column */}
      <div className="w-7 shrink-0 flex justify-end">
        <StatusLabel match={match} />
      </div>

      {/* Home team: Name [crest] — right-aligned */}
      <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
        <span className={`text-[13px] font-medium truncate text-right ${homeDim ? 'text-content-muted' : 'text-content-primary'}`}>
          {match.homeTeam.shortName || match.homeTeam.name}
        </span>
        <TeamCrest src={match.homeTeam.crest} name={match.homeTeam.name} size={16} />
      </div>

      {/* Score / Time — center, fixed width */}
      <div className="w-[4.5rem] sm:w-24 shrink-0 flex items-center justify-center">
        <CenterDisplay match={match} />
      </div>

      {/* Away team: [crest] Name — left-aligned */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <TeamCrest src={match.awayTeam.crest} name={match.awayTeam.name} size={16} />
        <span className={`text-[13px] font-medium truncate ${awayDim ? 'text-content-muted' : 'text-content-primary'}`}>
          {match.awayTeam.shortName || match.awayTeam.name}
        </span>
      </div>
    </Link>
  )
}
