import useSWR from 'swr'
import type {
  MatchesApiResponse,
  MatchDetail,
  Match,
  CompetitionStandings,
  Scorer,
  StandingsTable,
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

/**
 * One match, with head-to-head. Only polls while the match is in play.
 *
 * `initial` is the server-rendered copy. SWR shows it immediately and still
 * revalidates on mount (revalidateIfStale), so live polling carries on from it.
 */
export function useMatchDetail(
  id: number | string | null,
  initial?: { match: MatchDetail; headToHead: Match[] }
) {
  const { data, error, isLoading } = useSWR<MatchDetailResponse>(
    id ? `/api/match/${id}` : null,
    fetcher,
    {
      fallbackData: initial,
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
export function useStandings(competition: string | null, initial?: StandingsTable[]) {
  const { data, error, isLoading } = useSWR<StandingsResponse>(
    competition ? `/api/standings?competition=${competition}` : null,
    fetcher,
    {
      // The server copy carries the tables only; competition and season arrive with the first fetch.
      fallbackData: initial ? ({ standings: initial } as StandingsResponse) : undefined,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  )

  return {
    standings: data?.standings ?? [],
    competition: data?.competition,
    season: data?.season,
    error: data?.error ?? error?.message,
    isLoading,
  }
}

export function useScorers(competition: string | null, limit = 20, initial?: Scorer[]) {
  const { data, error, isLoading } = useSWR<{ scorers: Scorer[]; error?: string }>(
    competition ? `/api/scorers?competition=${competition}&limit=${limit}` : null,
    fetcher,
    {
      fallbackData: initial ? { scorers: initial } : undefined,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  )

  return {
    scorers: data?.scorers ?? [],
    error: data?.error ?? error?.message,
    isLoading,
  }
}

/**
 * A team and its matches. `initial` comes from the database at render time and
 * has no squad; the mount-time fetch through the API fills that in.
 */
export function useTeam(
  id: number | string | null,
  initial?: { team: TeamDetail; matches: Match[] }
) {
  const { data, error, isLoading } = useSWR<{
    team: TeamDetail
    matches: Match[]
    error?: string
  }>(id ? `/api/team/${id}` : null, fetcher, {
    fallbackData: initial,
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
