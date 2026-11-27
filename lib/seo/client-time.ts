'use client'

import { useSyncExternalStore } from 'react'

/**
 * Hydration-safe rendering for server-rendered views.
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
 *
 * Kick-off times and dates themselves go through `useKickoffTime`
 * (hooks/useKickoffTime.ts), which builds on this.
 */

const subscribe = () => () => {}

export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
