'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Play, Tv, ExternalLink } from 'lucide-react'
import { isLive, formatKickoffTime } from '@/lib/utils'
import { getWatchOptions } from '@/lib/tv/broadcasters'
import { getFreeStream } from '@/lib/tv/free-streams'
import { StreamPlayer } from './StreamPlayer'
import type { Match } from '@/lib/types'
import type { Country, StreamOverrides } from '@/lib/tv/types'

function TeamCrest({ src, teamName }: { src: string; teamName: string }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <span className="w-4 h-4 shrink-0 rounded-full bg-bg-elevated inline-flex items-center justify-center text-[8px] font-black text-content-muted">
        {teamName.slice(0, 1)}
      </span>
    )
  }
  return (
    <span className="relative inline-block w-4 h-4 shrink-0">
      <Image src={src} alt={teamName} fill sizes="16px" className="object-contain" onError={() => setFailed(true)} />
    </span>
  )
}

function CenterDisplay({ match }: { match: Match }) {
  const live = isLive(match.status) && match.status !== 'PAUSED'
  const isScheduled = match.status === 'SCHEDULED' || match.status === 'TIMED'
  const { home, away } = match.score.fullTime

  if (isScheduled) {
    return <span className="text-[13px] font-semibold text-content-secondary tabular-nums">{formatKickoffTime(match.utcDate)}</span>
  }
  return (
    <span className={`text-[15px] font-black tabular-nums tracking-tight ${live ? 'text-live-red' : 'text-content-primary'}`}>
      {home ?? '-'}&nbsp;-&nbsp;{away ?? '-'}
    </span>
  )
}

export function WatchMatchRow({
  match,
  country,
  overrides,
}: {
  match: Match
  country: Country
  overrides?: StreamOverrides
}) {
  const [open, setOpen] = useState(false)
  const broadcasters = getWatchOptions(match.competition.code, country.code)
  const stream = getFreeStream(match, overrides)
  const live = isLive(match.status)
  const matchTitle = `${match.homeTeam.shortName || match.homeTeam.name} vs ${match.awayTeam.shortName || match.awayTeam.name}`

  return (
    <div className="px-4 py-2.5 hover:bg-bg-elevated transition-colors">
      {/* Top line: teams + score/time */}
      <div className="flex items-center gap-2">
        {live && (
          <span className="w-7 shrink-0 text-[11px] text-live-red font-bold tabular-nums">
            {match.status === 'PAUSED' ? 'HT' : `${match.minute ?? '?'}'`}
          </span>
        )}
        <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
          <span className="text-[13px] font-medium truncate text-right text-content-primary">
            {match.homeTeam.shortName || match.homeTeam.name}
          </span>
          <TeamCrest src={match.homeTeam.crest} teamName={match.homeTeam.name} />
        </div>
        <div className="w-20 shrink-0 flex items-center justify-center">
          <CenterDisplay match={match} />
        </div>
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <TeamCrest src={match.awayTeam.crest} teamName={match.awayTeam.name} />
          <span className="text-[13px] font-medium truncate text-content-primary">
            {match.awayTeam.shortName || match.awayTeam.name}
          </span>
        </div>
      </div>

      {/* Bottom line: where to watch + play button */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {stream && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full bg-accent-green text-bg-primary text-[11px] font-semibold hover:opacity-90 transition-opacity"
          >
            <Play size={11} className="fill-current" />
            Watch
          </button>
        )}

        {broadcasters.length > 0 ? (
          broadcasters.map((b) => (
            <a
              key={b.name}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-bg-elevated text-content-secondary text-[11px] font-medium hover:text-content-primary transition-colors"
            >
              <Tv size={11} />
              {b.name}
              <ExternalLink size={9} className="opacity-60" />
            </a>
          ))
        ) : (
          !stream && <span className="text-[11px] text-content-muted">Check local listings</span>
        )}
      </div>

      {open && stream && (
        <StreamPlayer stream={stream} title={matchTitle} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
