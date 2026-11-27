'use client'

import { useSyncExternalStore } from 'react'
import { formatKickoffTime } from '@/lib/utils'

/**
 * Hydration-safe dates and times for server-rendered views.
 *
 * Kick-off times are shown in the viewer's own timezone, which the server
 * cannot know. If the server rendered its own local time, the browser's first
 * render would disagree and React would throw away the server HTML. So the
 * server - and the browser's hydration pass - render UTC, and the browser
 * switches to local time on the render straight after.
 *
 * useSyncExternalStore gives exactly that: the server snapshot (false) is used
 * for SSR and hydration, the client snapshot (true) for everything after,
 * including client-side navigations, which never see the UTC flash.
 */

const subscribe = () => () => {}

export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}

const UTC_TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

/** 24-hour kick-off time: local once on the client, UTC before that. */
export function kickoffTime(utcDate: string, local: boolean): string {
  return local ? formatKickoffTime(utcDate) : UTC_TIME.format(new Date(utcDate))
}

/** en-GB short date: local once on the client, UTC before that. */
export function shortDate(
  utcDate: string,
  local: boolean,
  options: Pick<Intl.DateTimeFormatOptions, 'day' | 'month' | 'year'>
): string {
  return new Date(utcDate).toLocaleDateString('en-GB', local ? options : { ...options, timeZone: 'UTC' })
}
