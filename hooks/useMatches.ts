import useSWR from 'swr'
import { litePollInterval, useLiteMode } from './useLiteMode'
import type { StandingsView } from '@/lib/standings-splits'
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
  const { enabled: lite } = useLiteMode()
  const { data, error, isLoading } = useSWR<MatchesApiResponse>(
    `/api/matches?date=${date}`,
    fetcher,
    {
      refreshInterval: (latest) => {
        const live = latest?.matches?.some(
          (m) => m.status === 'IN_PLAY' || m.status === 'PAUSED'
        )
        // No point polling a finished day every 30 seconds.
        return litePollInterval(live ? 30_000 : 120_000, lite)
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
  const { enabled: lite } = useLiteMode()
  const { data, error, isLoading } = useSWR<MatchDetailResponse>(
    id ? `/api/match/${id}` : null,
    fetcher,
    {
      fallbackData: initial,
      refreshInterval: (latest) => {
        const status = latest?.match?.status
        return litePollInterval(status === 'IN_PLAY' || status === 'PAUSED' ? 30_000 : 0, lite)
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

/**
 * League table. Changes only after matches, so no polling.
 *
 * `view` picks the overall table or the computed home/away split (PRD LG-1).
 * The overall URL is unchanged, so the server-rendered `initial` (which is
 * the overall table) only ever seeds that key.
 */
export function useStandings(
  competition: string | null,
  initial?: StandingsTable[],
  view: StandingsView = 'total'
) {
  const total = view === 'total'
  const { data, error, isLoading } = useSWR<StandingsResponse>(
    competition ? `/api/standings?competition=${competition}${total ? '' : `&view=${view}`}` : null,
    fetcher,
    {
      // The server copy carries the tables only; competition and season arrive with the first fetch.
      fallbackData: total && initial ? ({ standings: initial } as StandingsResponse) : undefined,
      revalidateOnFocus: false,
      // Not across views: switching to Home must show a loading state, never
      // the overall table under a "Home" label.
      keepPreviousData: false,
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
