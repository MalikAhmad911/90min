import type { Metadata } from 'next'
import { MatchDetailView } from '@/components/match/MatchDetailView'

export const metadata: Metadata = {
  title: 'Match centre | 90 Min Tactics',
}

export default function MatchPage({ params }: { params: { id: string } }) {
  return <MatchDetailView id={params.id} />
}
