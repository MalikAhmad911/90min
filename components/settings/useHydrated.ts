import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False during the server render and hydration, true afterwards.
 * Settings read localStorage and the browser's time zone, neither of which the
 * server can know, so controls show a skeleton until this flips rather than
 * rendering a default that then jumps.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
