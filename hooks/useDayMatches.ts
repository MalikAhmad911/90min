'use client'

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import {
  TIMEZONE_STORAGE_KEY,
  getPreferredTimeZone,
  localDateString,
  setPreferredTimeZone,
} from '@/lib/timezone'
import type { MatchesApiResponse } from '@/lib/types'

/**
 * The user's time zone, or null until mounted.
 *
 * Null on the server and on the first client render on purpose: the zone
 * only exists in the browser, and rendering a guess on the server would show
 * the wrong day and then flip it during hydration.
 */
export function usePreferredTimeZone() {
  const [tz, setTz] = useState<string | null>(null)

  useEffect(() => {
    setTz(getPreferredTimeZone())
    // Another tab (e.g. onboarding) changed the preference.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TIMEZONE_STORAGE_KEY) setTz(getPreferredTimeZone())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((next: string | null) => {
    setPreferredTimeZone(next)
    setTz(getPreferredTimeZone())
  }, [])

  return { tz, setTimeZone: update }
}

/** Today's date in `tz`, recomputed every minute so the feed rolls over at local midnight. */
export function useLocalToday(tz: string | null): string | null {
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    if (!tz) return
    const tick = () => setToday(localDateString(new Date(), tz))
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [tz])
  return tz ? today : null
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

/**
 * Matches for one LOCAL calendar day (PRD MAT-1). Same polling policy as
 * useMatches: fast only while something is live. Pass nulls to wait.
 */
export function useDayMatches(date: string | null, tz: string | null) {
  const key = date && tz ? `/api/matches?date=${date}&tz=${encodeURIComponent(tz)}` : null
  const { data, error, isLoading, mutate } = useSWR<MatchesApiResponse>(key, fetcher, {
    refreshInterval: (latest) => {
      const live = latest?.matches?.some((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
      return live ? 30_000 : 120_000
    },
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
    keepPreviousData: true,
  })

  return {
    matches: data?.matches ?? [],
    error: data?.error ?? (error as Error | undefined)?.message,
    // Waiting for the zone counts as loading, so the feed shows a skeleton.
    isLoading: key === null || isLoading,
    stale: data?.stale ?? false,
    retry: () => void mutate(),
  }
}
