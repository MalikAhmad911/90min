'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { DEVICE_ID_HEADER, getDeviceId } from '@/lib/device'
import type { FollowRecord, FollowSummary, FollowEntityType } from '@/lib/db/follow-queries'
import type { NotifyPrefs } from '@/app/api/follows/schema'

/**
 * This device's follows (PRD MAT-2, ON-1).
 *
 * - SWR keeps one shared copy, so every star on the page agrees.
 * - follow / unfollow are optimistic and roll back if the server refuses.
 * - The list is mirrored to localStorage so stars and the pinned "Following"
 *   section render instantly on the next visit, before the API answers.
 */

export type { FollowRecord, FollowSummary, FollowEntityType, NotifyPrefs }

export interface FollowTarget {
  entityType: FollowEntityType
  entityKey: string
}

interface FollowsResponse {
  follows: FollowRecord[]
}

const FOLLOWS_URL = '/api/follows'
const SUMMARY_URL = '/api/follows/summary'
export const FOLLOWS_MIRROR_KEY = '90min:follows'
const TYPES: readonly string[] = ['team', 'competition', 'match', 'player']

/* ------------------------------------------------------------------ *
 * localStorage mirror - every access guarded: storage can throw.
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is FollowRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.entityKey === 'string' && typeof v.entityType === 'string' && TYPES.includes(v.entityType)
}

function readMirror(): FollowRecord[] | undefined {
  try {
    const raw = window.localStorage.getItem(FOLLOWS_MIRROR_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    // Never trust a stored shape: drop anything malformed.
    return Array.isArray(parsed) ? parsed.filter(isRecord) : undefined
  } catch {
    return undefined
  }
}

function writeMirror(list: FollowRecord[]): void {
  try {
    window.localStorage.setItem(FOLLOWS_MIRROR_KEY, JSON.stringify(list))
  } catch {
    // not persisted; the API remains the source of truth
  }
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

async function send(deviceId: string, method: 'GET' | 'PUT' | 'DELETE', url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: {
      [DEVICE_ID_HEADER]: deviceId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data
}

const keyOf = (t: FollowTarget) => `${t.entityType}:${t.entityKey}`

/** The device id, available after mount (it lives in the browser only). */
export function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => setId(getDeviceId()), [])
  return id
}

export function useFollows() {
  const deviceId = useDeviceId()
  const { mutate: globalMutate } = useSWRConfig()

  // Read once per mount; before that the key is null and nothing renders.
  const fallback = useMemo<FollowsResponse | undefined>(() => {
    if (!deviceId) return undefined
    const list = readMirror()
    return list ? { follows: list } : undefined
  }, [deviceId])

  const { data, error, isLoading, mutate } = useSWR<FollowsResponse>(
    deviceId ? [FOLLOWS_URL, deviceId] : null,
    ([url, id]: [string, string]) => send(id, 'GET', url) as Promise<FollowsResponse>,
    { fallbackData: fallback, revalidateOnFocus: false, dedupingInterval: 5_000 }
  )

  useEffect(() => {
    if (data && data !== fallback) writeMirror(data.follows)
  }, [data, fallback])

  const follows = useMemo(() => data?.follows ?? [], [data])
  const followed = useMemo(() => new Set(follows.map(keyOf)), [follows])

  const isFollowing = useCallback(
    (entityType: FollowEntityType, entityKey: string | number) =>
      followed.has(`${entityType}:${String(entityKey)}`),
    [followed]
  )

  /** One optimistic write. Rejects (after rolling back) when the server refuses. */
  const write = useCallback(
    async (op: 'follow' | 'unfollow', target: FollowTarget, notify?: NotifyPrefs) => {
      const id = getDeviceId()
      const k = keyOf(target)
      const apply = (list: FollowRecord[], server?: FollowRecord): FollowRecord[] => {
        const rest = list.filter((f) => keyOf(f) !== k)
        if (op === 'unfollow') return rest
        const previous = list.find((f) => keyOf(f) === k)
        return [
          ...rest,
          server ?? {
            ...target,
            notify: { ...(previous?.notify ?? {}), ...(notify ?? {}) } as Record<string, boolean>,
            createdAt: previous?.createdAt ?? new Date().toISOString(),
          },
        ]
      }

      await globalMutate<FollowsResponse>(
        [FOLLOWS_URL, id],
        async (current) => {
          const body = op === 'follow' ? { ...target, ...(notify ? { notify } : {}) } : target
          const result = (await send(id, op === 'follow' ? 'PUT' : 'DELETE', FOLLOWS_URL, body)) as {
            follow?: FollowRecord
          }
          return { follows: apply(current?.follows ?? [], result.follow) }
        },
        {
          optimisticData: (current?: FollowsResponse) => ({
            follows: apply(current?.follows ?? readMirror() ?? []),
          }),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        }
      )
    },
    [globalMutate]
  )

  const follow = useCallback(
    (entityType: FollowEntityType, entityKey: string | number, notify?: NotifyPrefs) =>
      write('follow', { entityType, entityKey: String(entityKey) }, notify),
    [write]
  )
  const unfollow = useCallback(
    (entityType: FollowEntityType, entityKey: string | number) =>
      write('unfollow', { entityType, entityKey: String(entityKey) }),
    [write]
  )
  const toggle = useCallback(
    (entityType: FollowEntityType, entityKey: string | number) =>
      isFollowing(entityType, entityKey) ? unfollow(entityType, entityKey) : follow(entityType, entityKey),
    [follow, unfollow, isFollowing]
  )
  /** Updates notification toggles on a follow (following it if needed). */
  const setNotify = useCallback(
    (entityType: FollowEntityType, entityKey: string | number, notify: NotifyPrefs) =>
      write('follow', { entityType, entityKey: String(entityKey) }, notify),
    [write]
  )

  /**
   * Many changes at once (onboarding). Not optimistic per item: requests go
   * four at a time, then the list is refetched once. Resolves with the
   * targets that failed so the caller can offer a retry.
   */
  const applyChanges = useCallback(
    async (adds: FollowTarget[], removes: FollowTarget[]): Promise<FollowTarget[]> => {
      const id = getDeviceId()
      const jobs = [
        ...adds.map((t) => () => send(id, 'PUT', FOLLOWS_URL, t)),
        ...removes.map((t) => () => send(id, 'DELETE', FOLLOWS_URL, t)),
      ]
      const targets = [...adds, ...removes]
      const failed: FollowTarget[] = []
      let next = 0
      const worker = async () => {
        while (next < jobs.length) {
          const i = next++
          try {
            await jobs[i]()
          } catch {
            failed.push(targets[i])
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker))
      await mutate()
      return failed
    },
    [mutate]
  )

  return {
    deviceId,
    follows,
    /** True once there is something to show (cache, mirror or server). */
    ready: data !== undefined,
    isLoading,
    error: (error as Error | undefined)?.message,
    isFollowing,
    follow,
    unfollow,
    toggle,
    setNotify,
    applyChanges,
    retry: () => void mutate(),
  }
}

const EMPTY_SUMMARY: FollowSummary = { teams: [], competitions: [], players: [], matches: [] }

/**
 * Names, crests and next matches for everything followed. Refetches whenever
 * the set of follows changes, because the key includes its signature.
 */
export function useFollowSummary() {
  const { deviceId, follows, ready, error: followsError, retry: retryFollows } = useFollows()
  const signature = useMemo(() => follows.map(keyOf).sort().join(','), [follows])

  const { data, error, isLoading, mutate } = useSWR<FollowSummary>(
    deviceId && ready && signature ? [SUMMARY_URL, deviceId, signature] : null,
    ([url, id]: [string, string]) => send(id, 'GET', url) as Promise<FollowSummary>,
    { revalidateOnFocus: false, keepPreviousData: true }
  )

  return {
    summary: signature ? data : EMPTY_SUMMARY,
    hasFollows: signature.length > 0,
    isLoading: !ready || (Boolean(signature) && isLoading && !data),
    error: followsError ?? (error as Error | undefined)?.message,
    retry: () => {
      retryFollows()
      void mutate()
    },
  }
}
