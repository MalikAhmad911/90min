import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LeagueView } from '@/components/league/LeagueView'
import { FREE_COMPETITIONS, resolveCompetition } from '@/lib/competitions'
import { loadCompetitionPage } from '@/lib/seo/loaders'
import { buildCompetitionMetadata, notFoundMetadata } from '@/lib/seo/metadata'
import { competitionJsonLd } from '@/lib/seo/json-ld'
import { JsonLdScript } from '@/lib/seo/JsonLdScript'

/** Tables move only after matches; the client view refreshes on mount anyway. */
export const revalidate = 300

type Props = { params: { id: string } }

/** Pre-renders every competition we can serve, by code. */
export function generateStaticParams() {
  return FREE_COMPETITIONS.map((c) => ({ id: c.code }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const competition = resolveCompetition(params.id)
  if (!competition) return notFoundMetadata('League')
  const result = await loadCompetitionPage(competition.code)
  return buildCompetitionMetadata(competition, result.status === 'ok' ? result.data.standings : [])
}

export default async function LeaguePage({ params }: Props) {
  // Accepts a code ('PL') or the legacy numeric id ('2021'); anything else is
  // refused before a query is built from it.
  const competition = resolveCompetition(params.id)
  if (!competition) notFound()

  const result = await loadCompetitionPage(competition.code)
  const standings = result.status === 'ok' ? result.data.standings : []
  const scorers = result.status === 'ok' ? result.data.scorers : []

  return (
    <>
      <JsonLdScript data={competitionJsonLd(competition, standings)} />
      <LeagueView
        competition={competition}
        initialStandings={standings.length ? standings : undefined}
        initialScorers={scorers.length ? scorers : undefined}
      />
    </>
  )
}
