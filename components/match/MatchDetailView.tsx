'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPin, Users } from 'lucide-react'
import { useMatchDetail } from '@/hooks/useMatches'
import { isLive, formatKickoffTime } from '@/lib/utils'
import { resolveCompetition } from '@/lib/competitions'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { MatchEvents } from './MatchEvents'
import { MatchStats } from './MatchStats'
import { MatchLineups } from './MatchLineups'
import type { Match, MatchDetail } from '@/lib/types'

type Tab = 'summary' | 'lineups' | 'stats' | 'h2h'

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'stats', label: 'Stats' },
  { id: 'h2h', label: 'H2H' },
]

function StatusPill({ match }: { match: MatchDetail }) {
  if (isLive(match.status)) {
    const label = match.status === 'PAUSED' ? 'HT' : `${match.minute ?? '?'}'`
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-live-red/15 text-live-red text-[11px] font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-live-red animate-live-pulse" />
        {label}
      </span>
    )
  }

  if (match.status === 'FINISHED') {
    return (
      <span className="px-2.5 py-1 rounded-full bg-bg-elevated text-content-secondary text-[11px] font-semibold">
        Full time
      </span>
    )
  }

  if (match.status === 'POSTPONED' || match.status === 'CANCELLED') {
    return (
      <span className="px-2.5 py-1 rounded-full bg-bg-elevated text-content-muted text-[11px] font-semibold">
        {match.status === 'POSTPONED' ? 'Postponed' : 'Cancelled'}
      </span>
    )
  }

  return (
    <span className="px-2.5 py-1 rounded-full bg-bg-elevated text-content-secondary text-[11px] font-semibold">
      {formatKickoffTime(match.utcDate)}
    </span>
  )
}

function H2HRow({ match }: { match: Match }) {
  const date = new Date(match.utcDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Link
      href={`/match/${match.id}`}
      className="flex items-center gap-2 px-4 py-2.5 hover:bg-bg-elevated transition-colors"
    >
      <span className="w-20 shrink-0 text-[11px] text-content-muted">{date}</span>
      <span className="flex-1 text-[13px] text-content-primary truncate text-right">
        {match.homeTeam.shortName || match.homeTeam.name}
      </span>
      <span className="w-14 shrink-0 text-center text-[13px] font-bold text-content-primary tabular-nums">
        {match.score.fullTime.home ?? '-'} - {match.score.fullTime.away ?? '-'}
      </span>
      <span className="flex-1 text-[13px] text-content-primary truncate">
        {match.awayTeam.shortName || match.awayTeam.name}
      </span>
    </Link>
  )
}

export function MatchDetailView({ id }: { id: string }) {
  const { match, headToHead, error, isLoading } = useMatchDetail(id)
  const [tab, setTab] = useState<Tab>('summary')

  if (isLoading && !match) {
    return (
      <div className="px-4 py-8">
        <div className="h-28 bg-bg-surface rounded-lg animate-pulse" />
        <div className="h-9 bg-bg-surface rounded-lg animate-pulse mt-3" />
        <div className="h-48 bg-bg-surface rounded-lg animate-pulse mt-3" />
      </div>
    )
  }

  if (error || !match) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-sm font-medium text-content-secondary">Could not load this match</p>
        <p className="text-xs text-content-muted mt-1">{error ?? 'Match not found'}</p>
        <Link href="/" className="mt-4 text-[13px] text-accent-green hover:underline">
          Back to scores
        </Link>
      </div>
    )
  }

  const live = isLive(match.status)
  const played = match.status !== 'SCHEDULED' && match.status !== 'TIMED'
  const competition = resolveCompetition(match.competition.code)

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-divider">
        <Link
          href="/"
          aria-label="Back to scores"
          className="p-1 -ml-1 rounded-md text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        {competition ? (
          <Link
            href={`/leagues/${competition.code}`}
            className="text-[12px] text-content-secondary hover:text-content-primary transition-colors truncate"
          >
            {match.competition.name}
          </Link>
        ) : (
          <span className="text-[12px] text-content-secondary truncate">
            {match.competition.name}
          </span>
        )}
        {match.matchday && (
          <span className="text-[11px] text-content-muted shrink-0">
            Matchday {match.matchday}
          </span>
        )}
      </div>

      {/* Scoreline */}
      <div className="bg-bg-surface px-4 py-5">
        <div className="flex items-center justify-center mb-3">
          <StatusPill match={match} />
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/team/${match.homeTeam.id}`}
            className="flex-1 flex flex-col items-center gap-2 min-w-0 group"
          >
            <TeamCrest src={match.homeTeam.crest} name={match.homeTeam.name} size={56} />
            <span className="text-[13px] font-medium text-content-primary text-center line-clamp-2 group-hover:text-accent-green transition-colors">
              {match.homeTeam.shortName || match.homeTeam.name}
            </span>
          </Link>

          <div className="shrink-0 px-2 text-center">
            {played ? (
              <>
                <p
                  className={`text-3xl font-black tabular-nums tracking-tight ${
                    live ? 'text-live-red' : 'text-content-primary'
                  }`}
                >
                  {match.score.fullTime.home ?? 0}
                  <span className="mx-1.5 text-content-muted">-</span>
                  {match.score.fullTime.away ?? 0}
                </p>
                {match.score.halfTime.home !== null && (
                  <p className="text-[11px] text-content-muted mt-0.5 tabular-nums">
                    HT {match.score.halfTime.home} - {match.score.halfTime.away}
                  </p>
                )}
              </>
            ) : (
              <p className="text-2xl font-black text-content-secondary tabular-nums">
                {formatKickoffTime(match.utcDate)}
              </p>
            )}
          </div>

          <Link
            href={`/team/${match.awayTeam.id}`}
            className="flex-1 flex flex-col items-center gap-2 min-w-0 group"
          >
            <TeamCrest src={match.awayTeam.crest} name={match.awayTeam.name} size={56} />
            <span className="text-[13px] font-medium text-content-primary text-center line-clamp-2 group-hover:text-accent-green transition-colors">
              {match.awayTeam.shortName || match.awayTeam.name}
            </span>
          </Link>
        </div>

        {/* Venue / attendance / referee */}
        {(match.venue || match.attendance || match.referees?.length) && (
          <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
            {match.venue && (
              <span className="inline-flex items-center gap-1 text-[11px] text-content-muted">
                <MapPin size={11} />
                {match.venue}
              </span>
            )}
            {match.attendance && (
              <span className="inline-flex items-center gap-1 text-[11px] text-content-muted tabular-nums">
                <Users size={11} />
                {match.attendance.toLocaleString()}
              </span>
            )}
            {match.referees?.[0]?.name && (
              <span className="text-[11px] text-content-muted">{match.referees[0].name}</span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-divider overflow-x-auto scrollbar-hide">
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              tab === tabId
                ? 'bg-accent-green text-bg-primary font-semibold'
                : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-2 mx-2 mb-3 bg-bg-surface rounded-lg overflow-hidden">
        {tab === 'summary' && <MatchEvents match={match} />}
        {tab === 'lineups' && <MatchLineups home={match.homeTeam} away={match.awayTeam} />}
        {tab === 'stats' && <MatchStats match={match} />}
        {tab === 'h2h' &&
          (headToHead.length > 0 ? (
            <div className="divide-y divide-divider">
              {headToHead.map((m) => (
                <H2HRow key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-content-muted text-center py-8">
              No previous meetings available.
            </p>
          ))}
      </div>
    </div>
  )
}
