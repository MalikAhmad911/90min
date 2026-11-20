import { ArrowRightLeft, Square } from 'lucide-react'
import type { MatchDetail } from '@/lib/types'

type Side = 'home' | 'away'

interface TimelineEvent {
  minute: number
  injuryTime: number | null
  side: Side
  kind: 'goal' | 'card' | 'substitution'
  primary: string
  secondary?: string | null
  detail?: string | null
}

function sideOf(teamId: number, match: MatchDetail): Side {
  return teamId === match.homeTeam.id ? 'home' : 'away'
}

/** Flattens goals, bookings and substitutions into one ordered timeline. */
export function buildTimeline(match: MatchDetail): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const g of match.goals ?? []) {
    events.push({
      minute: g.minute,
      injuryTime: g.injuryTime ?? null,
      side: sideOf(g.team.id, match),
      kind: 'goal',
      primary: g.scorer.name,
      secondary: g.assist?.name ?? null,
      detail: g.type && g.type !== 'REGULAR' ? g.type.replace(/_/g, ' ').toLowerCase() : null,
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

  return events.sort((a, b) => a.minute - b.minute || (a.injuryTime ?? 0) - (b.injuryTime ?? 0))
}

function EventIcon({ event }: { event: TimelineEvent }) {
  if (event.kind === 'goal') return <span className="text-[13px] leading-none">&#9917;</span>
  if (event.kind === 'substitution') {
    return <ArrowRightLeft size={12} className="text-accent-green" />
  }
  const red = event.detail === 'RED' || event.detail === 'YELLOW_RED'
  return (
    <Square
      size={11}
      className={red ? 'fill-live-red text-live-red' : 'fill-yellow-400 text-yellow-400'}
    />
  )
}

function EventRow({ event }: { event: TimelineEvent }) {
  const minute = event.injuryTime ? `${event.minute}+${event.injuryTime}'` : `${event.minute}'`
  const alignRight = event.side === 'home'

  const body = (
    <div className={`flex-1 min-w-0 ${alignRight ? 'text-right' : 'text-left'}`}>
      <p className="text-[13px] text-content-primary font-medium truncate">{event.primary}</p>
      {event.secondary && (
        <p className="text-[11px] text-content-muted truncate">
          {event.kind === 'substitution' ? `out: ${event.secondary}` : `assist: ${event.secondary}`}
        </p>
      )}
      {event.detail && event.kind === 'goal' && (
        <p className="text-[11px] text-content-muted truncate">{event.detail}</p>
      )}
    </div>
  )

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {alignRight ? body : <div className="flex-1" />}
      <div className="flex items-center gap-1.5 shrink-0 w-16 justify-center">
        <EventIcon event={event} />
        <span className="text-[11px] text-content-muted tabular-nums">{minute}</span>
      </div>
      {alignRight ? <div className="flex-1" /> : body}
    </div>
  )
}

export function MatchEvents({ match }: { match: MatchDetail }) {
  const events = buildTimeline(match)

  if (events.length === 0) {
    const kickedOff = match.status !== 'SCHEDULED' && match.status !== 'TIMED'

    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[13px] text-content-secondary font-medium">
          {kickedOff ? 'No match events available' : 'Not kicked off yet'}
        </p>
        <p className="text-[11px] text-content-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
          {kickedOff
            ? 'Goals, cards and substitutions are not included on the current data plan. The score above is live.'
            : 'Goals, cards and substitutions will appear here once the match begins.'}
        </p>
      </div>
    )
  }

  return <div className="divide-y divide-divider">{events.map((e, i) => <EventRow key={i} event={e} />)}</div>
}
