import type { Metadata } from 'next'
import { FollowingView } from '@/components/follow/FollowingView'

export const metadata: Metadata = {
  title: 'Following — 90 Min Tactics',
  description: 'Your teams, leagues and players, with their next matches.',
  // Follows live on the device; the server-rendered page is an empty shell.
  robots: { index: false, follow: true },
}

export default function FollowingPage() {
  return <FollowingView />
}
