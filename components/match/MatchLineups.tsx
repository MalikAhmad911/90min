import type {
  LineupEntry,
  LineupPlayer,
  MatchLineupsData,
  MatchTeam,
  TeamLineupData,
} from '@/lib/types'
import { DetailsAttribution } from './DetailsAttribution'

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

/* ------------------------------------------------------------------ *
 * Provider lineups (Highlightly): formation pitch plus benches
 * ------------------------------------------------------------------ */

/** "E. Martínez" stays; "Joshua Kofi Acheampong" -> "Acheampong" so chips stay short. */
export function pitchName(name: string): string {
  const parts = name.trim().split(/s+/)
  if (parts.length <= 1 || /^[A-Z].$/.test(parts[0])) return name.trim()
  return parts[parts.length - 1]
}

function PitchPlayer({ player, side }: { player: LineupEntry; side: 'home' | 'away' }) {
  return (
    <li className="flex flex-col items-center gap-0.5 min-w-0 flex-1" aria-label={`${player.number ?? ''} ${player.name}`.trim()}>
      <span
        aria-hidden="true"
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums ${
          side === 'home' ? 'bg-accent-green text-bg-primary' : 'bg-content-primary text-bg-primary'
        }`}
      >
        {player.number ?? ''}
      </span>
      <span aria-hidden="true" className="text-[10px] text-content-primary truncate max-w-full px-0.5">
        {pitchName(player.name)}
      </span>
    </li>
  )
}

function HalfPitch({ team, side, label }: { team: TeamLineupData; side: 'home' | 'away'; label: string }) {
  // Home attacks downwards from the top goal; away upwards from the bottom.
  const rows = side === 'home' ? team.rows : [...team.rows].reverse()
  return (
    <div className="flex flex-col justify-around gap-2.5 py-3 flex-1" aria-label={label}>
      {rows.map((row, i) => (
        <ul key={i} className="flex items-start justify-around gap-1">
          {row.map((p, j) => (
            <PitchPlayer key={`${p.name}-${j}`} player={p} side={side} />
          ))}
        </ul>
      ))}
    </div>
  )
}

function Bench({ team, name }: { team: TeamLineupData; name: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-content-muted truncate">
        {name} bench
      </p>
      {team.bench.length > 0 ? (
        <ul className="pb-2">
          {team.bench.map((p, i) => (
            <PlayerRow
              key={`${p.name}-${i}`}
              player={{ id: i, name: p.name, shirtNumber: p.number, position: p.position }}
            />
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-3 text-[12px] text-content-muted">Not published.</p>
      )}
    </div>
  )
}

export function ProviderLineups({
  lineups,
  home,
  away,
}: {
  lineups: MatchLineupsData
  home: MatchTeam
  away: MatchTeam
}) {
  const homeName = home.shortName || home.name
  const awayName = away.shortName || away.name
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-divider text-[12px]">
        <span className="font-semibold text-content-primary truncate">
          {homeName}
          {lineups.home.formation && <span className="ml-2 text-accent-green">{lineups.home.formation}</span>}
        </span>
        <span className="font-semibold text-content-primary truncate text-right">
          {lineups.away.formation && <span className="mr-2 text-accent-green">{lineups.away.formation}</span>}
          {awayName}
        </span>
      </div>

      <div className="mx-3 my-3 rounded-lg border border-divider bg-bg-elevated relative overflow-hidden flex flex-col min-h-[30rem]">
        {/* Pitch markings: halfway line and centre circle. */}
        <div aria-hidden="true" className="absolute left-0 right-0 top-1/2 border-t border-divider" />
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-divider"
        />
        <HalfPitch team={lineups.home} side="home" label={`${homeName} starting XI`} />
        <HalfPitch team={lineups.away} side="away" label={`${awayName} starting XI`} />
      </div>

      <div className="flex flex-col sm:flex-row sm:divide-x divide-y sm:divide-y-0 divide-divider border-t border-divider">
        <Bench team={lineups.home} name={homeName} />
        <Bench team={lineups.away} name={awayName} />
      </div>
    </div>
  )
}

/** Whether the Lineups tab has anything to show. */
export function hasLineups(home: MatchTeam, away: MatchTeam, lineups?: MatchLineupsData | null): boolean {
  return (
    Boolean(lineups) ||
    (home.lineup?.length ?? 0) > 0 ||
    (away.lineup?.length ?? 0) > 0 ||
    (home.bench?.length ?? 0) > 0 ||
    (away.bench?.length ?? 0) > 0
  )
}

export function MatchLineups({
  home,
  away,
  lineups,
  source,
}: {
  home: MatchTeam
  away: MatchTeam
  lineups?: MatchLineupsData | null
  source?: 'highlightly' | null
}) {
  if (lineups) {
    return (
      <div>
        <ProviderLineups lineups={lineups} home={home} away={away} />
        <DetailsAttribution source={source} />
      </div>
    )
  }

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
