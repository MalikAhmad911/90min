import Image from 'next/image'
import { LiveBadge } from './LiveBadge'
import { getStatusLabel, isLive } from '@/lib/utils'
import type { Match } from '@/lib/types'

interface MatchCardProps {
  match: Match
}

function TeamCrest({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-6 h-6 shrink-0">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-contain"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}

function ScoreOrTime({ match }: { match: Match }) {
  const live = isLive(match.status)
  const { home, away } = match.score.fullTime

  if (match.status === 'SCHEDULED' || match.status === 'TIMED') {
    return (
      <span className="text-content-muted text-sm font-medium">
        {getStatusLabel(match.status, match.minute, match.utcDate)}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`text-lg font-black ${live ? 'text-content-primary' : 'text-content-secondary'}`}>
          {home ?? '-'}
        </span>
        <span className="text-content-muted text-sm">-</span>
        <span className={`text-lg font-black ${live ? 'text-content-primary' : 'text-content-secondary'}`}>
          {away ?? '-'}
        </span>
      </div>
      {live ? (
        <LiveBadge minute={match.minute} />
      ) : (
        <span className="text-content-muted text-xs font-medium">
          {getStatusLabel(match.status, match.minute, match.utcDate)}
        </span>
      )}
    </div>
  )
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <div className="flex items-center px-4 py-3 hover:bg-bg-elevated transition-colors cursor-pointer border-b border-divider last:border-b-0">
      {/* Home team */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <TeamCrest src={match.homeTeam.crest} alt={match.homeTeam.name} />
        <span className="text-sm font-medium text-content-primary truncate">
          {match.homeTeam.shortName}
        </span>
      </div>

      {/* Score / Time */}
      <div className="px-4 flex flex-col items-center shrink-0">
        <ScoreOrTime match={match} />
      </div>

      {/* Away team */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="text-sm font-medium text-content-primary truncate text-right">
          {match.awayTeam.shortName}
        </span>
        <TeamCrest src={match.awayTeam.crest} alt={match.awayTeam.name} />
      </div>
    </div>
  )
}
