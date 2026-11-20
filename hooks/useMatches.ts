import useSWR from 'swr'
import type {
  MatchesApiResponse,
  MatchDetail,
  Match,
  CompetitionStandings,
  Scorer,
  TeamDetail,
} from '@/lib/types'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

/** Matches for one date. Polls fast only while something is actually live. */
export function useMatches(date: string) {
  const { data, error, isLoading } = useSWR<MatchesApiResponse>(
    `/api/matches?date=${date}`,
    fetcher,
    {
      refreshInterval: (latest) => {
        const live = latest?.matches?.some(
          (m) => m.status === 'IN_PLAY' || m.status === 'PAUSED'
        )
        // No point polling a finished day every 30 seconds.
        return live ? 30_000 : 120_000
      },
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
      keepPreviousData: true,
    }
  )

  return {
    matches: data?.matches ?? [],
    error: data?.error ?? error?.message,
    isLoading,
    stale: data?.stale ?? false,
    updatedAt: data?.updatedAt,
  }
}

interface MatchDetailResponse {
  match: MatchDetail
  headToHead: Match[]
  error?: string
}

/** One match, with head-to-head. Only polls while the match is in play. */
export function useMatchDetail(id: number | string | null) {
  const { data, error, isLoading } = useSWR<MatchDetailResponse>(
    id ? `/api/match/${id}` : null,
    fetcher,
    {
      refreshInterval: (latest) => {
        const status = latest?.match?.status
        return status === 'IN_PLAY' || status === 'PAUSED' ? 30_000 : 0
      },
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  )

  return {
    match: data?.match,
    headToHead: data?.headToHead ?? [],
    error: data?.error ?? error?.message,
    isLoading,
  }
}

type StandingsResponse = CompetitionStandings & { error?: string }

/** League table. Changes only after matches, so no polling. */
export function useStandings(competition: string | null) {
  const { data, error, isLoading } = useSWR<StandingsResponse>(
    competition ? `/api/standings?competition=${competition}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  )

  return {
    standings: data?.standings ?? [],
    competition: data?.competition,
    season: data?.season,
    error: data?.error ?? error?.message,
    isLoading,
  }
}

export function useScorers(competition: string | null, limit = 20) {
  const { data, error, isLoading } = useSWR<{ scorers: Scorer[]; error?: string }>(
    competition ? `/api/scorers?competition=${competition}&limit=${limit}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  )

  return {
    scorers: data?.scorers ?? [],
    error: data?.error ?? error?.message,
    isLoading,
  }
}

export function useTeam(id: number | string | null) {
  const { data, error, isLoading } = useSWR<{
    team: TeamDetail
    matches: Match[]
    error?: string
  }>(id ? `/api/team/${id}` : null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  return {
    team: data?.team,
    matches: data?.matches ?? [],
    error: data?.error ?? error?.message,
    isLoading,
  }
}
