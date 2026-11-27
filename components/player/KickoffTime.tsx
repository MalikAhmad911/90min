'use client'

import { useKickoffTime } from '@/hooks/useKickoffTime'

const DAY = { weekday: 'short', day: 'numeric', month: 'short' } as const

/**
 * A kickoff date/time in the viewer's own zone and 12h/24h clock.
 *
 * The server does not know the reader's time zone, so it renders UTC (marked
 * as such) and the browser replaces it after hydration. Rendering local time
 * on the server would show the host's zone and cause a hydration mismatch.
 */
export function KickoffTime({ utcDate, withTime = true }: { utcDate: string; withTime?: boolean }) {
  const kickoff = useKickoffTime()
  const date = kickoff.day(utcDate, DAY)

  if (!withTime) return <time dateTime={utcDate}>{date}</time>

  const time = kickoff.time(utcDate)
  return <time dateTime={utcDate}>{kickoff.local ? `${date}, ${time}` : `${date}, ${time} UTC`}</time>
}
