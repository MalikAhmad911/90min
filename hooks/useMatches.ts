import useSWR from 'swr'
import type { MatchesApiResponse } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useMatches(date: string) {
  const { data, error, isLoading } = useSWR<MatchesApiResponse>(
    `/api/matches?date=${date}`,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
    }
  )

  return {
    matches: data?.matches ?? [],
    error: data?.error ?? error?.message,
    isLoading,
  }
}
