import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ArrowLeft } from 'lucide-react'
import { isDatabaseConfigured } from '@/lib/db'
import {
  getPlayerPageData,
  playerIdSchema,
  type PlayerMatch,
  type PlayerPageData,
} from '@/lib/db/player-queries'
import { decodePhotoUrl } from '@/lib/providers/thesportsdb-players'
import { ageOn, displayClubName } from '@/components/player/player-utils'
import { PlayerPhoto } from '@/components/player/PlayerPhoto'
import { KickoffTime } from '@/components/player/KickoffTime'
import { TeamCrest } from '@/components/ui/TeamCrest'

/**
 * Player page. A pure database read: ingestion keeps `players` filled, so a
 * visitor never waits on (or spends quota with) a provider.
 *
 * Revalidated hourly - often enough for a new result to show and for the age
 * to tick over on a birthday, rarely enough to cost nothing.
 */
export const revalidate = 3600

/** One query per request, shared by generateMetadata and the page. */
const load = cache(async (rawId: string): Promise<PlayerPageData | null> => {
  const parsed = playerIdSchema.safeParse(rawId)
  if (!parsed.success || !isDatabaseConfigured()) return null
  return getPlayerPageData(parsed.data)
})

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await load(params.id)
  if (!data) return { title: 'Player not found | 90 Min Tactics' }
  const { player } = data
  const club = player.team ? displayClubName(player.team.name) : null
  const title = club ? `${player.name} – ${club} | 90 Min Tactics` : `${player.name} | 90 Min Tactics`
  const description = [
    player.position,
    club,
    player.nationality,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    title,
    description: description ? `${player.name}: ${description}. Profile, season stats and fixtures.` : undefined,
    alternates: { canonical: `/player/${player.id}` },
  }
}

/** JSON for a <script> tag. `<` is escaped so a name can never close the tag. */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function personSchema(data: PlayerPageData, photo: string | null) {
  const { player } = data
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: player.name,
    url: `/player/${player.id}`,
    ...(player.dateOfBirth ? { birthDate: player.dateOfBirth } : {}),
    ...(player.nationality ? { nationality: player.nationality } : {}),
    ...(player.heightCm
      ? { height: { '@type': 'QuantitativeValue', value: player.heightCm, unitCode: 'CMT' } }
      : {}),
    ...(photo ? { image: photo } : {}),
    ...(player.team
      ? {
          affiliation: {
            '@type': 'SportsTeam',
            name: displayClubName(player.team.name),
            url: `/team/${player.team.id}`,
          },
        }
      : {}),
    ...(player.wikidataId ? { sameAs: [`https://www.wikidata.org/wiki/${player.wikidataId}`] } : {}),
  }
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-bg-elevated/60 rounded-md px-3 py-2 min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-content-muted">{label}</dt>
      <dd className="text-[13px] text-content-primary font-semibold truncate mt-0.5">{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg-surface rounded-lg overflow-hidden">
      <h2 className="px-4 py-2.5 text-[12px] font-semibold text-content-secondary border-b border-divider">
        {title}
      </h2>
      {children}
    </section>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12px] text-content-muted">{children}</p>
}

function MatchRow({ match, teamId }: { match: PlayerMatch; teamId: number }) {
  const isHome = match.homeTeam.id === teamId
  const opponent = isHome ? match.awayTeam : match.homeTeam
  const played = match.score.home != null && match.score.away != null
  return (
    <Link
      href={`/match/${match.id}`}
      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-bg-elevated transition-colors"
    >
      <span className="w-28 shrink-0 text-[11px] text-content-muted tabular-nums">
        <KickoffTime utcDate={match.utcDate} withTime={!played} />
      </span>
      <span
        className="w-4 shrink-0 text-[10px] text-content-muted uppercase font-semibold"
        aria-label={isHome ? 'Home' : 'Away'}
      >
        {isHome ? 'H' : 'A'}
      </span>
      <TeamCrest src={opponent.crest} name={opponent.name} size={16} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-content-primary truncate">{opponent.shortName}</span>
        <span className="block text-[10px] text-content-muted truncate">{match.competitionName}</span>
      </span>
      {played && (
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-content-primary">
          {match.score.home} - {match.score.away}
        </span>
      )}
    </Link>
  )
}

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const data = await load(params.id)
  if (!data) notFound()

  const { player, stats, recent, upcoming } = data
  const photo = decodePhotoUrl(player.photoUrl)
  const age = ageOn(player.dateOfBirth)
  const club = player.team

  const totals = stats.reduce(
    (acc, s) => ({ goals: acc.goals + s.goals, assists: acc.assists + (s.assists ?? 0) }),
    { goals: 0, assists: 0 }
  )

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(personSchema(data, photo?.src ?? null)) }}
      />

      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 border-b border-divider">
        <Link
          href={club ? `/team/${club.id}` : '/'}
          aria-label={club ? `Back to ${club.name}` : 'Back to scores'}
          className="p-1 -ml-1 rounded-md text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors self-start"
        >
          <ArrowLeft size={16} />
        </Link>
        <PlayerPhoto src={photo?.src ?? null} name={player.name} size={72} />
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold text-content-primary leading-tight">{player.name}</h1>
          {club ? (
            <Link
              href={`/team/${club.id}`}
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-content-secondary hover:text-accent-green transition-colors"
            >
              <TeamCrest src={club.crest} name={club.name} size={16} />
              {displayClubName(club.name)}
            </Link>
          ) : (
            <p className="mt-1 text-[12px] text-content-muted">Club unknown</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-2 px-2 pb-3">
        {/* Facts */}
        <Section title="Profile">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
            <Fact label="Position" value={player.position ?? '–'} />
            <Fact label="Shirt" value={player.shirtNumber != null ? `#${player.shirtNumber}` : '–'} />
            <Fact label="Nationality" value={player.nationality ?? '–'} />
            <Fact label="Age" value={age != null ? `${age} yrs` : '–'} />
            <Fact
              label="Born"
              value={
                player.dateOfBirth
                  ? new Date(`${player.dateOfBirth}T00:00:00Z`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })
                  : '–'
              }
            />
            <Fact label="Height" value={player.heightCm ? `${player.heightCm} cm` : '–'} />
          </dl>
        </Section>

        {/* Season stats */}
        <Section title="Season stats">
          {stats.length === 0 ? (
            <EmptyNote>
              No goal or assist data. Stats are only published for each competition&apos;s top scorers.
            </EmptyNote>
          ) : (
            <table className="w-full text-[12px]">
              <caption className="sr-only">Goals and assists by competition</caption>
              <thead>
                <tr className="border-b border-divider text-[10px] uppercase text-content-muted">
                  <th scope="col" className="text-left font-bold px-4 py-1.5">Competition</th>
                  <th scope="col" className="font-bold px-2 py-1.5 text-center" title="Matches played">MP</th>
                  <th scope="col" className="font-bold px-2 py-1.5 text-center" title="Goals">G</th>
                  <th scope="col" className="font-bold px-2 py-1.5 text-center" title="Assists">A</th>
                  <th scope="col" className="font-bold px-4 py-1.5 text-center" title="Penalties scored">Pen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {stats.map((s) => (
                  <tr key={`${s.competitionCode}-${s.seasonId}`}>
                    <th scope="row" className="text-left font-normal px-4 py-2">
                      <Link
                        href={`/leagues/${s.competitionCode}`}
                        className="text-content-primary hover:text-accent-green transition-colors"
                      >
                        {s.competitionName}
                      </Link>
                      <span className="block text-[10px] text-content-muted">
                        {[s.seasonLabel, s.teamName].filter(Boolean).join(' · ')}
                      </span>
                    </th>
                    <td className="px-2 py-2 text-center tabular-nums text-content-secondary">
                      {s.playedMatches ?? '–'}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums font-bold text-content-primary">
                      {s.goals}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-content-secondary">
                      {s.assists ?? '–'}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums text-content-secondary">
                      {s.penalties ?? '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {stats.length > 1 && (
                <tfoot>
                  <tr className="border-t border-divider text-content-primary">
                    <th scope="row" className="text-left font-semibold px-4 py-2">Total</th>
                    <td />
                    <td className="px-2 py-2 text-center tabular-nums font-bold">{totals.goals}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{totals.assists}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </Section>

        {/* Club matches */}
        {club ? (
          <>
            <Section title={`Next matches · ${displayClubName(club.name)}`}>
              {upcoming.length === 0 ? (
                <EmptyNote>No upcoming fixtures in the competitions we cover.</EmptyNote>
              ) : (
                <div className="divide-y divide-divider">
                  {upcoming.map((m) => (
                    <MatchRow key={m.id} match={m} teamId={club.id} />
                  ))}
                </div>
              )}
            </Section>
            <Section title={`Recent results · ${displayClubName(club.name)}`}>
              {recent.length === 0 ? (
                <EmptyNote>No recent results in the competitions we cover.</EmptyNote>
              ) : (
                <div className="divide-y divide-divider">
                  {recent.map((m) => (
                    <MatchRow key={m.id} match={m} teamId={club.id} />
                  ))}
                </div>
              )}
            </Section>
          </>
        ) : null}

        <footer className="px-2 pt-1 text-[10px] text-content-muted leading-relaxed">
          <p>
            Data:{' '}
            <a href="https://www.football-data.org" className="underline hover:text-content-secondary" rel="noopener noreferrer" target="_blank">
              football-data.org
            </a>{' '}
            ·{' '}
            <a href="https://www.wikidata.org" className="underline hover:text-content-secondary" rel="noopener noreferrer" target="_blank">
              Wikidata
            </a>{' '}
            ·{' '}
            <a href="https://www.thesportsdb.com" className="underline hover:text-content-secondary" rel="noopener noreferrer" target="_blank">
              TheSportsDB
            </a>
          </p>
          {photo && <p className="mt-0.5">Photo: {photo.credit}</p>}
        </footer>
      </div>
    </div>
  )
}
