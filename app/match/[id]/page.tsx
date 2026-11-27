import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MatchDetailView } from '@/components/match/MatchDetailView'
import { loadMatchPage } from '@/lib/seo/loaders'
import { buildMatchMetadata, genericEntityMetadata, notFoundMetadata } from '@/lib/seo/metadata'
import { matchJsonLd } from '@/lib/seo/json-ld'
import { JsonLdScript } from '@/lib/seo/JsonLdScript'
import { paths } from '@/lib/seo/site'
import type { MatchDetail } from '@/lib/types'

/**
 * Cached HTML for a minute. The page is a pure database read; the client view
 * revalidates through /api/match on mount and polls while the match is live,
 * so a minute-old shell costs a crawler nothing and a fan a single refresh.
 */
export const revalidate = 60

type Props = { params: { id: string } }

/**
 * Nothing is pre-built (there are thousands of matches), but exporting this
 * opts the route into on-demand ISR: each match is rendered on its first
 * request and then served from cache. Without it Next 14 renders every
 * request from scratch and `revalidate` has no effect.
 */
export function generateStaticParams(): Props['params'][] {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await loadMatchPage(params.id)
  if (result.status === 'not-found') return notFoundMetadata('Match')
  if (result.status === 'unavailable') return genericEntityMetadata('Match centre', paths.match(params.id))
  return buildMatchMetadata(result.data.match)
}

export default async function MatchPage({ params }: Props) {
  const result = await loadMatchPage(params.id)
  if (result.status === 'not-found') notFound()

  if (result.status === 'unavailable') {
    // No database: behave exactly as before, loading everything client-side.
    return <MatchDetailView id={params.id} />
  }

  const { match, headToHead, venue } = result.data
  return (
    <>
      <JsonLdScript data={matchJsonLd(match, { venue })} />
      <MatchDetailView
        id={params.id}
        // The database row has the same shape /api/match returns.
        initialData={{ match: match as MatchDetail, headToHead }}
      />
    </>
  )
}
