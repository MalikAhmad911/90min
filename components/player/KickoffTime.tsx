'use client'

import { useEffect, useState } from 'react'

/**
 * A kickoff date/time in the viewer's own zone.
 *
 * The server does not know the reader's time zone, so it renders UTC (marked
 * as such) and the browser replaces it after hydration. Rendering local time
 * on the server would show the host's zone and cause a hydration mismatch.
 */
export function KickoffTime({ utcDate, withTime = true }: { utcDate: string; withTime?: boolean }) {
  const [local, setLocal] = useState<string | null>(null)

  useEffect(() => {
    const d = new Date(utcDate)
    const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    setLocal(withTime ? `${date}, ${time}` : date)
  }, [utcDate, withTime])

  if (local) return <time dateTime={utcDate}>{local}</time>

  const d = new Date(utcDate)
  const date = d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })
  return <time dateTime={utcDate}>{withTime ? `${date}, ${time} UTC` : date}</time>
}
