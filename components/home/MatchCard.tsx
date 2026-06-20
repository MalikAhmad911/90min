'use client'

import { useState } from 'react'
import Image from 'next/image'
import { isLive, formatKickoffTime } from '@/lib/utils'
import type { Match } from '@/lib/types'

function TeamCrest({ src, teamName }: { src: string; teamName: string }) {
  const [imgSrc, setImgSrc] = useState(src)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className="w-4 h-4 shrink-0 rounded-full bg-bg-elevated inline-flex items-center justify-center text-[8px] font-black text-content-muted">
        {teamName.slice(0, 1)}
      </span>
    )
  }

  return (
    <span className="relative inline-block w-4 h-4 shrink-0">
      <Image
        src={imgSrc}
        alt={teamName}
        fill
        sizes="16px"
        className="object-contain"
        onError={() => {
          if (imgSrc === src) {
            fetch(`/api/team-badge?name=${encodeURIComponent(teamName)}`)
              .then((r) => r.json())
              .then(({ badge }) => { if (badge) setImgSrc(badge); else setFailed(true) })
              .catch(() => setFailed(true))
          } else {
            setFailed(true)
          }
        }}
      />
    </span>
  )
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

  if (isScheduled) {
    return (
      <span className="text-[13px] font-semibold text-content-secondary tabular-nums">
        {formatKickoffTime(match.utcDate)}
      </span>
    )
  }

  const scoreColor = live ? 'text-live-red' : 'text-content-primary'

  return (
    <span className={`text-[15px] font-black tabular-nums tracking-tight ${scoreColor}`}>
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
    <div className="flex items-center px-4 py-2.5 hover:bg-bg-elevated transition-colors cursor-pointer gap-2">
      {/* Status: FT / HT / live minute — left column */}
      <div className="w-7 shrink-0 flex justify-end">
        <StatusLabel match={match} />
      </div>

      {/* Home team: Name [crest] — right-aligned */}
      <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
        <span className={`text-[13px] font-medium truncate text-right ${homeDim ? 'text-content-muted' : 'text-content-primary'}`}>
          {match.homeTeam.shortName || match.homeTeam.name}
        </span>
        <TeamCrest src={match.homeTeam.crest} teamName={match.homeTeam.name} />
      </div>

      {/* Score / Time — center, fixed width */}
      <div className="w-24 shrink-0 flex items-center justify-center">
        <CenterDisplay match={match} />
      </div>

      {/* Away team: [crest] Name — left-aligned */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <TeamCrest src={match.awayTeam.crest} teamName={match.awayTeam.name} />
        <span className={`text-[13px] font-medium truncate ${awayDim ? 'text-content-muted' : 'text-content-primary'}`}>
          {match.awayTeam.shortName || match.awayTeam.name}
        </span>
      </div>
    </div>
  )
}
