'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Users, MapPin } from 'lucide-react'
import { useTeam } from '@/hooks/useMatches'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { isLive } from '@/lib/utils'
import { kickoffTime, shortDate, useIsClient } from '@/lib/seo/client-time'
import type { Match, TeamDetail } from '@/lib/types'
import { SquadList } from '@/components/team/SquadList'
import { FollowButton } from '@/components/follow/FollowButton'

type Tab = 'matches' | 'squad'

function MatchRow({ match, teamId }: { match: Match; teamId: number }) {
  const isHome = match.homeTeam.id === teamId
  const opponent = isHome ? match.awayTeam : match.homeTeam
  const played = match.status !== 'SCHEDULED' && match.status !== 'TIMED'
  const live = isLive(match.status)
  const local = useIsClient()

  const date = shortDate(match.utcDate, local, { day: 'numeric', month: 'short' })

  // Result letter from this team's point of view.
  let result: 'W' | 'D' | 'L' | null = null
  if (match.status === 'FINISHED') {
    const own = isHome ? match.score.fullTime.home : match.score.fullTime.away
    const other = isHome ? match.score.fullTime.away : match.score.fullTime.home
    if (own !== null && other !== null) result = own > other ? 'W' : own < other ? 'L' : 'D'
  }

  const resultColour =
    result === 'W'
      ? 'bg-accent-green text-bg-primary'
      : result === 'L'
        ? 'bg-live-red text-white'
        : 'bg-bg-elevated text-content-secondary'

  return (
    <Link
      href={`/match/${match.id}`}
      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-bg-elevated transition-colors"
    >
      <span className="w-11 shrink-0 text-[11px] text-content-muted tabular-nums">{date}</span>
      <span className="w-5 shrink-0 text-[10px] text-content-muted uppercase font-semibold">
        {isHome ? 'H' : 'A'}
      </span>
      <span className="flex-1 text-[13px] text-content-primary truncate">
        {opponent.shortName || opponent.name}
      </span>
      {played ? (
        <span
          className={`shrink-0 text-[13px] font-bold tabular-nums ${
            live ? 'text-live-red' : 'text-content-primary'
          }`}
        >
          {match.score.fullTime.home ?? 0} - {match.score.fullTime.away ?? 0}
        </span>
      ) : (
        <span className="shrink-0 text-[12px] text-content-secondary tabular-nums">
          {kickoffTime(match.utcDate, local)}
        </span>
      )}
      {result && (
        <span
          className={`shrink-0 w-4 h-4 rounded-sm inline-flex items-center justify-center text-[9px] font-black ${resultColour}`}
        >
          {result}
        </span>
      )}
    </Link>
  )
}

export function TeamView({
  id,
  initialData,
  renderedAt,
}: {
  id: string
  /** Team and matches from the database at render time (no squad). */
  initialData?: { team: TeamDetail; matches: Match[] }
  /**
   * The server's clock when it rendered, so hydration splits fixtures from
   * results at the same instant the server did. A cached page can be minutes
   * old, and a match crossing "now" in between would otherwise mismatch.
   */
  renderedAt?: number
}) {
  const { team, matches, error, isLoading } = useTeam(id, initialData)
  const [tab, setTab] = useState<Tab>('matches')
  const isClient = useIsClient()

  if (isLoading && !team) {
    return (
      <div className="px-4 py-8">
        <div className="h-24 bg-bg-surface rounded-lg animate-pulse" />
        <div className="h-64 bg-bg-surface rounded-lg animate-pulse mt-3" />
      </div>
    )
  }

  // A failed refresh keeps the team already on screen; the error state is
  // only for when there is nothing to show.
  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-sm font-medium text-content-secondary">Could not load this team</p>
        <p className="text-xs text-content-muted mt-1">{error ?? 'Team not found'}</p>
        <Link href="/" className="mt-4 text-[13px] text-accent-green hover:underline">
          Back to scores
        </Link>
      </div>
    )
  }

  const teamId = Number(id)

  // Newest first for results, soonest first for fixtures.
  const now = !isClient && renderedAt !== undefined ? renderedAt : Date.now()
  const upcoming = matches
    .filter((m) => new Date(m.utcDate).getTime() >= now)
    .slice(0, 10)
  const recent = matches
    .filter((m) => new Date(m.utcDate).getTime() < now)
    .reverse()
    .slice(0, 15)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-divider">
        <Link
          href="/"
          aria-label="Back to scores"
          className="p-1 -ml-1 rounded-md text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>

        <TeamCrest src={team.crest} name={team.name} size={44} />

        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-content-primary truncate">{team.name}</h1>
          <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
            {team.venue && (
              <span className="inline-flex items-center gap-1 text-[11px] text-content-muted">
                <MapPin size={10} />
                {team.venue}
              </span>
            )}
            {team.founded && (
              <span className="text-[11px] text-content-muted tabular-nums">
                Est. {team.founded}
              </span>
            )}
          </div>
        </div>
        <FollowButton entityType="team" entityKey={team.id} name={team.shortName || team.name} showLabel />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-divider">
        {([
          { id: 'matches' as const, label: 'Matches', Icon: Calendar },
          { id: 'squad' as const, label: 'Squad', Icon: Users },
        ]).map(({ id: tabId, label, Icon }) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              tab === tabId
                ? 'bg-accent-green text-bg-primary font-semibold'
                : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'matches' && (
        <div className="flex flex-col gap-2 mt-2 px-2 pb-3">
          {upcoming.length > 0 && (
            <div className="bg-bg-surface rounded-lg overflow-hidden">
              <p className="px-4 py-2.5 text-[12px] font-semibold text-content-secondary border-b border-divider">
                Fixtures
              </p>
              <div className="divide-y divide-divider">
                {upcoming.map((m) => (
                  <MatchRow key={m.id} match={m} teamId={teamId} />
                ))}
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div className="bg-bg-surface rounded-lg overflow-hidden">
              <p className="px-4 py-2.5 text-[12px] font-semibold text-content-secondary border-b border-divider">
                Results
              </p>
              <div className="divide-y divide-divider">
                {recent.map((m) => (
                  <MatchRow key={m.id} match={m} teamId={teamId} />
                ))}
              </div>
            </div>
          )}

          {matches.length === 0 && (
            <div className="bg-bg-surface rounded-lg px-4 py-10 text-center">
              <p className="text-[13px] text-content-secondary font-medium">No matches found</p>
              <p className="text-[11px] text-content-muted mt-1">
                This team may play in a competition outside the free plan.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'squad' && (
        <div className="mt-2 mx-2 mb-3 bg-bg-surface rounded-lg overflow-hidden">
          <SquadList teamId={teamId} fallback={team.squad} />
        </div>
      )}
    </div>
  )
}
