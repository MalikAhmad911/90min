import type { MatchTeam, LineupPlayer } from '@/lib/types'

function PlayerRow({ player }: { player: LineupPlayer }) {
  return (
    <li className="flex items-center gap-2.5 px-4 py-1.5">
      <span className="w-5 shrink-0 text-[11px] text-content-muted tabular-nums text-right">
        {player.shirtNumber ?? '-'}
      </span>
      <span className="text-[13px] text-content-primary truncate flex-1">{player.name}</span>
      {player.position && (
        <span className="text-[10px] uppercase tracking-wide text-content-muted shrink-0">
          {player.position}
        </span>
      )}
    </li>
  )
}

function TeamLineup({ team }: { team: MatchTeam }) {
  const lineup = team.lineup ?? []
  const bench = team.bench ?? []

  return (
    <div className="flex-1 min-w-0">
      <div className="px-4 py-2.5 border-b border-divider">
        <p className="text-[13px] font-semibold text-content-primary truncate">
          {team.shortName || team.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {team.formation && (
            <span className="text-[11px] text-accent-green font-semibold">{team.formation}</span>
          )}
          {team.coach?.name && (
            <span className="text-[11px] text-content-muted truncate">{team.coach.name}</span>
          )}
        </div>
      </div>

      {lineup.length > 0 ? (
        <>
          <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-content-muted">
            Starting XI
          </p>
          <ul>
            {lineup.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </ul>
        </>
      ) : (
        <p className="px-4 py-4 text-[12px] text-content-muted">Lineup not published.</p>
      )}

      {bench.length > 0 && (
        <>
          <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-content-muted">
            Bench
          </p>
          <ul className="pb-2">
            {bench.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function MatchLineups({ home, away }: { home: MatchTeam; away: MatchTeam }) {
  const hasAny =
    (home.lineup?.length ?? 0) > 0 ||
    (away.lineup?.length ?? 0) > 0 ||
    (home.bench?.length ?? 0) > 0 ||
    (away.bench?.length ?? 0) > 0

  if (!hasAny) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[13px] text-content-secondary font-medium">Lineups not available</p>
        <p className="text-[11px] text-content-muted mt-1">
          They usually appear about an hour before kickoff, and not every competition publishes
          them on this plan.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row sm:divide-x divide-y sm:divide-y-0 divide-divider">
      <TeamLineup team={home} />
      <TeamLineup team={away} />
    </div>
  )
}
