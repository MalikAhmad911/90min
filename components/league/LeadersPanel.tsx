'use client'

import Link from 'next/link'
import useSWR from 'swr'
import type { Leader, Leaders } from '@/lib/db/league-queries'
import { TeamCrest } from '@/components/ui/TeamCrest'

const fetcher = async (url: string): Promise<Leaders> => {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as Leaders
}

/**
 * Stat leaders: goals and assists, from our stored scorers table.
 *
 * The provider publishes only its top goalscorers, so the assists board is
 * "assists among the top scorers" - the footnote says so instead of letting
 * it pass for a complete assists table.
 */
export function LeadersPanel({ code, limit = 10 }: { code: string; limit?: number }) {
  const { data, error, isLoading } = useSWR<Leaders>(
    `/api/league/${encodeURIComponent(code)}/leaders?limit=${limit}`,
    fetcher,
    { revalidateOnFocus: false }
  )

  if (isLoading && !data) {
    return (
      <div className="p-3 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading stat leaders">
        {[0, 1].map((k) => (
          <div key={k} className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-7 bg-bg-elevated rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (error && !data) return <Message title="Could not load stat leaders" hint={error.message} />

  const goals = data?.goals ?? []
  const assists = data?.assists ?? []
  if (goals.length === 0 && assists.length === 0) {
    return (
      <Message
        title="No player stats yet"
        hint="Top scorers are not published for every competition on this plan."
      />
    )
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 sm:divide-x divide-divider">
        <Board title="Goals" unit="goals" leaders={goals} empty="No goals recorded yet." />
        <Board
          title="Assists"
          unit="assists"
          leaders={assists}
          empty="No assist data published for this competition."
        />
      </div>
      <p className="px-3 py-2 border-t border-divider text-[10px] text-content-muted">
        Assists are ranked among the competition&apos;s top scorers only. Data: football-data.org
      </p>
    </div>
  )
}

function Board({
  title,
  unit,
  leaders,
  empty,
}: {
  title: string
  unit: string
  leaders: Leader[]
  empty: string
}) {
  return (
    <section aria-labelledby={`leaders-${unit}`}>
      <h3
        id={`leaders-${unit}`}
        className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-content-secondary border-b border-divider"
      >
        {title}
      </h3>
      {leaders.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] text-content-muted">{empty}</p>
      ) : (
        <ol className="divide-y divide-divider">
          {leaders.map((l, i) => (
            <li key={l.playerId} className="flex items-center gap-2 px-3 py-2">
              <span className="w-5 shrink-0 text-[11px] text-content-muted tabular-nums">{i + 1}</span>
              <TeamCrest src={l.teamCrest} name={l.teamName} size={16} />
              <span className="flex-1 min-w-0">
                <Link
                  href={`/player/${l.playerId}`}
                  className="block text-[12px] text-content-primary truncate hover:text-accent-green transition-colors"
                >
                  {l.playerName}
                </Link>
                <Link
                  href={`/team/${l.teamId}`}
                  className="block text-[10px] text-content-muted truncate hover:text-content-secondary"
                >
                  {l.teamName}
                </Link>
              </span>
              <span
                className="text-[13px] font-bold text-content-primary tabular-nums"
                aria-label={`${l.value} ${unit}`}
              >
                {l.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Message({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[13px] text-content-secondary font-medium">{title}</p>
      {hint && <p className="text-[11px] text-content-muted mt-1">{hint}</p>}
    </div>
  )
}
