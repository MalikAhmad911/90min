import { ArrowRightLeft, Square } from 'lucide-react'
import type { MatchDetail } from '@/lib/types'
import type { MatchEventsExtras } from '@/lib/db/event-queries'

type Side = 'home' | 'away'

/** What MatchEvents accepts: a match detail plus the optional events extras the API adds. */
export type MatchWithEvents = Omit<MatchDetail, 'goals'> & MatchEventsExtras

export interface TimelineEvent {
  minute: number
  injuryTime: number | null
  side: Side
  kind: 'goal' | 'card' | 'substitution'
  primary: string
  secondary?: string | null
  detail?: string | null
  /** Goals only: disallowed after the fact. Kept visible, struck through. */
  cancelled?: boolean
}

function sideOf(teamId: number, match: Pick<MatchDetail, 'homeTeam'>): Side {
  return teamId === match.homeTeam.id ? 'home' : 'away'
}

/** Human label for a goal type ('PENALTY' -> 'penalty', 'OWN' -> 'own goal'). */
export function goalLabel(type: string | null | undefined): string | null {
  if (!type || type === 'REGULAR') return null
  if (type === 'OWN') return 'own goal'
  return type.replace(/_/g, ' ').toLowerCase()
}

/** "90+11′" for stoppage time, "57′" otherwise. */
export function formatMinute(minute: number, injuryTime: number | null | undefined): string {
  return injuryTime ? `${minute}+${injuryTime}′` : `${minute}′`
}

/** Flattens goals, bookings and substitutions into one ordered timeline. */
export function buildTimeline(match: MatchWithEvents | MatchDetail): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const g of (match.goals ?? []) as (NonNullable<MatchDetail['goals']>[number] & {
    cancelled?: boolean
  })[]) {
    events.push({
      minute: g.minute,
      injuryTime: g.injuryTime ?? null,
      side: sideOf(g.team.id, match),
      kind: 'goal',
      primary: g.scorer.name,
      secondary: g.assist?.name ?? null,
      detail: goalLabel(g.type),
      cancelled: Boolean(g.cancelled),
    })
  }

  for (const b of match.bookings ?? []) {
    events.push({
      minute: b.minute,
      injuryTime: null,
      side: sideOf(b.team.id, match),
      kind: 'card',
      primary: b.player.name,
      detail: b.card,
    })
  }

  for (const s of match.substitutions ?? []) {
    events.push({
      minute: s.minute,
      injuryTime: null,
      side: sideOf(s.team.id, match),
      kind: 'substitution',
      primary: s.playerIn.name,
      secondary: s.playerOut.name,
    })
  }

  // Stable sort keeps same-minute events in provider order.
  return events.sort((a, b) => a.minute - b.minute || (a.injuryTime ?? 0) - (b.injuryTime ?? 0))
}

function EventIcon({ event }: { event: TimelineEvent }) {
  if (event.kind === 'goal') {
    return (
      <span aria-hidden="true" className={`text-[13px] leading-none ${event.cancelled ? 'opacity-40' : ''}`}>
        &#9917;
      </span>
    )
  }
  if (event.kind === 'substitution') {
    return <ArrowRightLeft size={12} className="text-accent-green" aria-hidden="true" />
  }
  const red = event.detail === 'RED' || event.detail === 'YELLOW_RED'
  return (
    <Square
      size={11}
      aria-hidden="true"
      className={red ? 'fill-live-red text-live-red' : 'fill-yellow-400 text-yellow-400'}
    />
  )
}

/** Plain-language summary of one event for screen readers. */
function describe(event: TimelineEvent, minute: string, teamName: string): string {
  if (event.kind === 'goal') {
    const kind = event.detail ? ` (${event.detail})` : ''
    const base = `Goal${kind}, ${event.primary}, ${teamName}, ${minute}`
    return event.cancelled ? `Disallowed goal: ${base}` : base
  }
  if (event.kind === 'substitution') {
    return `Substitution, ${teamName}, ${minute}: ${event.primary} on for ${event.secondary ?? 'unknown'}`
  }
  return `${event.detail === 'RED' || event.detail === 'YELLOW_RED' ? 'Red' : 'Yellow'} card, ${event.primary}, ${teamName}, ${minute}`
}

function EventRow({ event, teamName }: { event: TimelineEvent; teamName: string }) {
  const minute = formatMinute(event.minute, event.injuryTime)
  const alignRight = event.side === 'home'
  const struck = event.cancelled ? 'line-through text-content-muted' : 'text-content-primary'

  const body = (
    <div className={`flex-1 min-w-0 ${alignRight ? 'text-right' : 'text-left'}`} aria-hidden="true">
      <p className={`text-[13px] font-medium truncate ${struck}`}>{event.primary}</p>
      {event.secondary && (
        <p className="text-[11px] text-content-muted truncate">
          {event.kind === 'substitution' ? `out: ${event.secondary}` : `assist: ${event.secondary}`}
        </p>
      )}
      {event.kind === 'goal' && (event.detail || event.cancelled) && (
        <p className="text-[11px] text-content-muted truncate">
          {[event.detail, event.cancelled ? 'disallowed' : null].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )

  return (
    <li className="flex items-center gap-3 px-4 py-2" aria-label={describe(event, minute, teamName)}>
      {alignRight ? body : <div className="flex-1" />}
      <div className="flex items-center gap-1.5 shrink-0 w-16 justify-center" aria-hidden="true">
        <EventIcon event={event} />
        <span
          className={`text-[11px] tabular-nums ${event.cancelled ? 'line-through text-content-muted' : 'text-content-muted'}`}
        >
          {minute}
        </span>
      </div>
      {alignRight ? <div className="flex-1" /> : body}
    </li>
  )
}

/** The ODbL notice OpenLigaDB's licence requires wherever its data is shown. */
export function EventsAttribution({
  attribution,
}: {
  attribution: NonNullable<MatchEventsExtras['attribution']>
}) {
  return (
    <p className="px-4 py-2.5 text-[10px] leading-relaxed text-content-muted border-t border-divider">
      Goal data from{' '}
      <a href={attribution.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-content-secondary">
        OpenLigaDB
      </a>{' '}
      (www.openligadb.de), licensed under{' '}
      <a
        href={attribution.licenseUrl}
        target="_blank"
        rel="noopener noreferrer license"
        className="underline hover:text-content-secondary"
      >
        ODbL 1.0
      </a>
      .
    </p>
  )
}

function EmptyState({ match }: { match: MatchWithEvents }) {
  const kickedOff = match.status !== 'SCHEDULED' && match.status !== 'TIMED'
  const finished = match.status === 'FINISHED'
  const scored = (match.score.fullTime.home ?? 0) + (match.score.fullTime.away ?? 0) > 0

  let title: string
  let body: string
  if (!kickedOff) {
    title = 'Not kicked off yet'
    body =
      match.goalCoverage === 'none'
        ? 'Goal timeline isn’t available for this competition yet. The score will be live.'
        : 'Goals will appear here once the match begins.'
  } else if (match.goalCoverage === 'match' && !scored) {
    title = finished ? 'No goals in this match' : 'No goals yet'
    body = finished ? 'It finished goalless.' : 'Goals will appear here as they are scored.'
  } else if (match.goalCoverage === 'match' || match.goalCoverage === 'competition') {
    title = 'Goal details aren’t available for this match yet'
    body = 'They usually follow within a few minutes. The score above is live.'
  } else {
    title = 'Goal timeline isn’t available for this competition yet'
    body = 'Goals, cards and substitutions are not included on the current data plan. The score above is live.'
  }

  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[13px] text-content-secondary font-medium">{title}</p>
      <p className="text-[11px] text-content-muted mt-1.5 max-w-xs mx-auto leading-relaxed">{body}</p>
    </div>
  )
}

export function MatchEvents({ match }: { match: MatchWithEvents | MatchDetail }) {
  const m = match as MatchWithEvents
  const events = buildTimeline(m)
  const attribution = m.attribution ?? null

  if (events.length === 0) {
    return (
      <div>
        <EmptyState match={m} />
        {attribution && <EventsAttribution attribution={attribution} />}
      </div>
    )
  }

  const teamName = (side: Side) =>
    side === 'home' ? m.homeTeam.shortName || m.homeTeam.name : m.awayTeam.shortName || m.awayTeam.name

  return (
    <div>
      <ol className="divide-y divide-divider" aria-label="Match timeline">
        {events.map((e, i) => (
          <EventRow key={i} event={e} teamName={teamName(e.side)} />
        ))}
      </ol>
      {m.goalsDisagreeWithScore && (
        <p className="px-4 py-2 text-[11px] text-content-muted border-t border-divider" role="note">
          The goal list doesn’t add up to the final score yet; it may still be being corrected.
        </p>
      )}
      {attribution && <EventsAttribution attribution={attribution} />}
    </div>
  )
}
