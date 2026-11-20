import type { Metadata } from 'next'
import { TeamView } from '@/components/team/TeamView'

export const metadata: Metadata = {
  title: 'Team | 90 Min Tactics',
}

export default function TeamPage({ params }: { params: { id: string } }) {
  return <TeamView id={params.id} />
}
