import { notFound } from 'next/navigation'
import { LeagueView } from '@/components/league/LeagueView'
import { FREE_COMPETITIONS, resolveCompetition } from '@/lib/competitions'

/** Pre-renders every competition we can serve, by code. */
export function generateStaticParams() {
  return FREE_COMPETITIONS.map((c) => ({ id: c.code }))
}

export function generateMetadata({ params }: { params: { id: string } }) {
  const competition = resolveCompetition(params.id)
  return { title: competition ? `${competition.name} | 90 Min Tactics` : 'League' }
}

export default function LeaguePage({ params }: { params: { id: string } }) {
  // Accepts a code ('PL') or the legacy numeric id ('2021').
  const competition = resolveCompetition(params.id)
  if (!competition) notFound()

  return <LeagueView competition={competition} />
}
