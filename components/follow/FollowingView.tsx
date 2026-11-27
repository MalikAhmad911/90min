'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'
import { useFollowSummary } from '@/hooks/useFollows'
import { usePreferredTimeZone } from '@/hooks/useDayMatches'
import { FollowButton } from './FollowButton'
import { Crest } from '@/components/ui/Crest'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { isLive } from '@/lib/utils'
import { useKickoffTime } from '@/hooks/useKickoffTime'
import type { Match } from '@/lib/types'

/** "Sat 29 Nov, 15:00 vs Chelsea" - or "LIVE vs Chelsea" while in play. */
function NextMatch({ match, teamId, timeZone }: { match: Match | null; teamId?: number; timeZone: string | null }) {
  const kickoff = useKickoffTime(timeZone)
  if (!match) return <span className="text-[12px] text-content-muted">No upcoming match</span>

  const opponent =
    teamId === undefined
      ? `${match.homeTeam.shortName} vs ${match.awayTeam.shortName}`
      : match.homeTeam.id === teamId
        ? `vs ${match.awayTeam.shortName}`
        : `at ${match.homeTeam.shortName}`
  const when = kickoff.day(match.utcDate, { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <Link
      href={`/match/${match.id}`}
      className="text-[12px] text-content-secondary hover:text-content-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green rounded"
    >
      {isLive(match.status) ? (
        <span className="font-bold text-live-red">LIVE </span>
      ) : (
        <span className="tabular-nums">
          {when}, {kickoff.time(match.utcDate)}{' '}
        </span>
      )}
      {opponent}
    </Link>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="flex items-center gap-3 px-4 py-3 border-b border-divider last:border-b-0">{children}</li>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="bg-bg-surface rounded-lg overflow-hidden">
      <h2 className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-content-muted">{title}</h2>
      <ul>{children}</ul>
    </section>
  )
}

export function FollowingView() {
  const { summary, hasFollows, isLoading, error, retry } = useFollowSummary()
  const { tz } = usePreferredTimeZone()

  return (
    <div className="px-2 py-4">
      <div className="flex items-center justify-between px-2 mb-3">
        <h1 className="text-lg font-bold text-content-primary">Following</h1>
        {hasFollows && (
          <Link
            href="/onboarding"
            className="rounded-full px-3 py-1 text-[12px] font-medium text-content-secondary hover:text-content-primary hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            Edit
          </Link>
        )}
      </div>

      {error && !summary && (
        <div role="alert" className="flex flex-col items-center py-16 text-center">
          <p className="text-sm font-medium text-content-secondary">Could not load what you follow</p>
          <p className="text-xs text-content-muted mt-1">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-full bg-bg-elevated px-3 py-1.5 text-[12px] font-medium text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            Try again
          </button>
        </div>
      )}

      {!error && isLoading && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !error && !hasFollows && (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <Star size={36} className="text-content-muted mb-3" aria-hidden="true" />
          <p className="text-sm font-semibold text-content-primary">You are not following anything yet</p>
          <p className="text-xs text-content-muted mt-1 max-w-xs">
            Follow teams and leagues to pin their matches at the top of your feed.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 rounded-full bg-accent-green px-4 py-2 text-[13px] font-bold text-bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            Pick teams and leagues
          </Link>
        </div>
      )}

      {summary && hasFollows && !isLoading && (
        <div className="flex flex-col gap-2">
          {summary.teams.length > 0 && (
            <Section title="Teams">
              {summary.teams.map((t) => (
                <Row key={t.id}>
                  <TeamCrest src={t.crest} name={t.name} size={28} />
                  <div className="flex-1 min-w-0">
                    {t.found ? (
                      <Link href={`/team/${t.id}`} className="block truncate text-[14px] font-semibold text-content-primary hover:underline">
                        {t.name}
                      </Link>
                    ) : (
                      <span className="block truncate text-[14px] font-semibold text-content-muted">{t.name}</span>
                    )}
                    <NextMatch match={t.nextMatch} teamId={t.id} timeZone={tz} />
                  </div>
                  <FollowButton entityType="team" entityKey={t.id} name={t.name} />
                </Row>
              ))}
            </Section>
          )}

          {summary.competitions.length > 0 && (
            <Section title="Leagues">
              {summary.competitions.map((c) => (
                <Row key={c.code}>
                  <Crest src={c.emblem} name={c.name} size={28} />
                  <div className="flex-1 min-w-0">
                    <Link href={`/leagues/${c.code}`} className="block truncate text-[14px] font-semibold text-content-primary hover:underline">
                      {c.name}
                    </Link>
                    <NextMatch match={c.nextMatch} timeZone={tz} />
                  </div>
                  <FollowButton entityType="competition" entityKey={c.code} name={c.name} />
                </Row>
              ))}
            </Section>
          )}

          {summary.players.length > 0 && (
            <Section title="Players">
              {summary.players.map((p) => (
                <Row key={p.id}>
                  <Crest name={p.name} size={28} />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-content-primary">{p.name}</span>
                    {p.teamName && <span className="block truncate text-[11px] text-content-muted">{p.teamName}</span>}
                    <NextMatch match={p.nextMatch} teamId={p.teamId ?? undefined} timeZone={tz} />
                  </div>
                  <FollowButton entityType="player" entityKey={p.id} name={p.name} />
                </Row>
              ))}
            </Section>
          )}

          {summary.matches.length > 0 && (
            <Section title="Matches">
              {summary.matches.map((m) => {
                const name = `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`
                return (
                  <Row key={m.id}>
                    <Crest src={m.competition.emblem} name={m.competition.name} size={28} />
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-content-primary">{name}</span>
                      <NextMatch match={m} timeZone={tz} />
                    </div>
                    <FollowButton entityType="match" entityKey={m.id} name={name} />
                  </Row>
                )
              })}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
