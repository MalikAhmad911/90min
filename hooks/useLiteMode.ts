'use client'

/**
 * Lite mode (PRD non-functional: "Data usage: Lite mode - no images on slow
 * networks").
 *
 * Three-way preference stored in localStorage:
 * - 'auto' (default, nothing stored): on when the browser reports Data Saver
 *   or a 2G-class connection (Network Information API - Chromium/Android, which
 *   is where most slow-network visitors are; elsewhere it stays off).
 * - 'on' / 'off': the user's explicit choice from Settings, which always wins.
 *
 * Components hide crests and images with:
 *   const { enabled } = useLiteMode()
 *   if (enabled) return <InitialsBadge … />
 * The server render (and the first client render) reports `enabled: false`;
 * the real value arrives right after hydration.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { createPreferenceStore } from '@/lib/i18n/preference-store'

export type LiteModePreference = 'auto' | 'on' | 'off'

export const LITE_MODE_STORAGE_KEY = '90min:lite-mode'

function parsePreference(raw: string | null): LiteModePreference {
  return raw === 'on' || raw === 'off' ? raw : 'auto'
}

export const liteModeStore = createPreferenceStore<LiteModePreference>(LITE_MODE_STORAGE_KEY, parsePreference)

interface NetworkInformationLike extends EventTarget {
  saveData?: boolean
  effectiveType?: string
}

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection
}

const SLOW_TYPES = new Set(['slow-2g', '2g'])

/** True when the browser says data is scarce. False where the API is missing. */
export function isSlowNetwork(): boolean {
  const c = connection()
  if (!c) return false
  return c.saveData === true || (typeof c.effectiveType === 'string' && SLOW_TYPES.has(c.effectiveType))
}

function subscribeNetwork(onChange: () => void): () => void {
  const c = connection()
  c?.addEventListener?.('change', onChange)
  return () => c?.removeEventListener?.('change', onChange)
}

/** Pure decision, exported for tests. */
export function resolveLiteMode(preference: LiteModePreference, slowNetwork: boolean): boolean {
  return preference === 'on' || (preference === 'auto' && slowNetwork)
}

/** How much slower SWR polls in Lite mode. */
export const LITE_POLL_FACTOR = 2

/**
 * A polling interval for the current mode: Lite mode polls half as often.
 * 0 means "do not poll" and stays 0.
 */
export function litePollInterval(ms: number, lite: boolean): number {
  return lite && ms > 0 ? ms * LITE_POLL_FACTOR : ms
}

export interface LiteModeState {
  /** Hide images and crests when true. */
  enabled: boolean
  preference: LiteModePreference
  /** Enabled only because of the network, not by the user. */
  automatic: boolean
  /** 'auto' clears the stored choice. Returns false if it could not be saved. */
  setPreference: (preference: LiteModePreference) => boolean
}

export function useLiteMode(): LiteModeState {
  const preference = useSyncExternalStore(liteModeStore.subscribe, liteModeStore.read, () => 'auto' as const)
  const slow = useSyncExternalStore(subscribeNetwork, isSlowNetwork, () => false)

  const setPreference = useCallback(
    (next: LiteModePreference) => liteModeStore.write(next === 'auto' ? null : next),
    []
  )

  const enabled = resolveLiteMode(preference, slow)
  return { enabled, preference, automatic: enabled && preference === 'auto', setPreference }
}
