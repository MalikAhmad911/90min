'use client'

import Link from 'next/link'
import useSWR from 'swr'
import type { SquadPlayer } from '@/lib/db/player-queries'
import type { TeamDetail } from '@/lib/types'
import { ageOn, groupByPosition } from '@/components/player/player-utils'

interface SquadResponse {
  teamId?: number
  players: SquadPlayer[]
  error?: string
}

const fetcher = async (url: string): Promise<SquadResponse> => {
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as Partial<SquadResponse>
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return { players: data.players ?? [], teamId: data.teamId }
}

/**
 * A club's squad grouped Goalkeepers / Defenders / Midfielders / Attackers,
 * each player linking to /player/{id}.
 *
 * Reads our own players table (/api/player/squad), so it costs no provider
 * quota. `fallback` is the provider squad TeamView already has: it is shown,
 * unlinked, while our table has nothing for this club yet - those players
 * have no page until ingestion stores them.
 */
export function SquadList({
  teamId,
  fallback,
}: {
  teamId: number | string
  fallback?: TeamDetail['squad']
}) {
  const id = Number(teamId)
  const valid = Number.isInteger(id) && id > 0
  const { data, error, isLoading } = useSWR<SquadResponse>(
    valid ? `/api/player/squad?team=${id}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  if (!valid) return <Message title="Squad unavailable" hint="Unknown team." />

  if (isLoading && !data) {
    return (
      <div className="p-3 flex flex-col gap-2" aria-busy="true" aria-label="Loading squad">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 bg-bg-elevated rounded animate-pulse" />
        ))}
      </div>
    )
  }

  const stored = data?.players ?? []
  const linked = stored.length > 0
  const list: SquadPlayer[] = linked
    ? stored
    : (fallback ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        nationality: p.nationality,
        dateOfBirth: p.dateOfBirth,
        shirtNumber: null,
      }))

  if (list.length === 0) {
    return error ? (
      <Message title="Could not load the squad" hint={error.message} />
    ) : (
      <Message
        title="Squad unavailable"
        hint="Squad lists are loaded gradually and are not published for every team."
      />
    )
  }

  const groups = groupByPosition(list)

  return (
    <div>
      {groups.map(({ group, label, players }) => (
        <section key={group} aria-labelledby={`squad-${group}`}>
          <h3
            id={`squad-${group}`}
            className="px-4 py-2 bg-bg-elevated/40 text-[11px] font-semibold uppercase tracking-wider text-content-secondary"
          >
            {label} <span className="text-content-muted font-normal">({players.length})</span>
          </h3>
          <ul className="divide-y divide-divider">
            {players.map((p) => (
              <li key={p.id}>
                <Row player={p} linked={linked} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Row({ player, linked }: { player: SquadPlayer; linked: boolean }) {
  const age = ageOn(player.dateOfBirth)
  const content = (
    <>
      <span className="w-6 shrink-0 text-[11px] text-content-muted tabular-nums text-right">
        {player.shirtNumber ?? ''}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-content-primary truncate">{player.name}</span>
        {player.position && (
          <span className="block text-[10px] text-content-muted truncate">{player.position}</span>
        )}
      </span>
      {player.nationality && (
        <span className="text-[11px] text-content-muted shrink-0 truncate max-w-[7rem]">
          {player.nationality}
        </span>
      )}
      <span className="w-10 shrink-0 text-[11px] text-content-secondary tabular-nums text-right">
        {age != null ? <span aria-label={`${age} years old`}>{age}</span> : ''}
      </span>
    </>
  )

  const cls = 'flex items-center gap-3 px-4 py-2'
  return linked ? (
    <Link href={`/player/${player.id}`} className={`${cls} hover:bg-bg-elevated transition-colors`}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
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
