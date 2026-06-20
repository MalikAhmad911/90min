import useSWR from 'swr'
import type { StreamOverrides } from '@/lib/tv/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const EMPTY: StreamOverrides = { byMatch: {}, byCompetition: {} }

/** Admin-managed stream overrides, polled so newly-added streams appear live. */
export function useStreamOverrides(): StreamOverrides {
  const { data } = useSWR<StreamOverrides>('/api/streams', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })
  return data ?? EMPTY
}
