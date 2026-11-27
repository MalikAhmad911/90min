import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TeamView } from '@/components/team/TeamView'
import { loadTeamPage } from '@/lib/seo/loaders'
import { buildTeamMetadata, genericEntityMetadata, notFoundMetadata } from '@/lib/seo/metadata'
import { teamJsonLd } from '@/lib/seo/json-ld'
import { JsonLdScript } from '@/lib/seo/JsonLdScript'
import { paths } from '@/lib/seo/site'

/** Fixtures change a few times a week; five minutes is plenty fresh for the shell. */
export const revalidate = 300

type Props = { params: { id: string } }

/** Rendered on first request and cached, rather than pre-built; see app/match/[id]/page.tsx. */
export function generateStaticParams(): Props['params'][] {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await loadTeamPage(params.id)
  if (result.status === 'not-found') return notFoundMetadata('Team')
  if (result.status === 'unavailable') return genericEntityMetadata('Team', paths.team(params.id))
  return buildTeamMetadata(result.data.team, result.data.matches)
}

export default async function TeamPage({ params }: Props) {
  const result = await loadTeamPage(params.id)
  if (result.status === 'not-found') notFound()

  if (result.status === 'unavailable') {
    return <TeamView id={params.id} />
  }

  const { team, matches } = result.data
  return (
    <>
      <JsonLdScript data={teamJsonLd(team, matches)} />
      <TeamView
        id={params.id}
        // The squad is not stored yet; the view's mount-time API fetch adds it.
        initialData={{
          team: {
            id: team.id,
            name: team.name,
            shortName: team.shortName ?? team.name,
            tla: team.tla ?? '',
            crest: team.crest ?? '',
          },
          matches,
        }}
        renderedAt={Date.now()}
      />
    </>
  )
}
