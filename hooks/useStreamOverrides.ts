import useSWR from 'swr'
import type { StreamOverrides } from '@/lib/tv/types'
import { litePollInterval, useLiteMode } from './useLiteMode'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const EMPTY: StreamOverrides = { byMatch: {}, byCompetition: {} }

/** Admin-managed stream overrides, polled so newly-added streams appear live. */
export function useStreamOverrides(): StreamOverrides {
  const { enabled: lite } = useLiteMode()
  const { data } = useSWR<StreamOverrides>('/api/streams', fetcher, {
    refreshInterval: litePollInterval(60_000, lite),
    revalidateOnFocus: true,
  })
  return data ?? EMPTY
}
