import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { isDatabaseConfigured } from '@/lib/db'
import { getTeamsByCompetition, type CatalogTeam } from '@/lib/db/follow-queries'
import { OnboardingFlow } from './OnboardingFlow'

export const metadata: Metadata = {
  title: 'Personalise your feed — 90 Min Tactics',
  description: 'Pick your teams and leagues and set your time zone.',
  // A per-device settings flow: nothing here for a search engine.
  robots: { index: false, follow: true },
}

// Rendered per request (the catalogue below is cached), so a build never
// needs a database connection.
export const dynamic = 'force-dynamic'

/** Teams change a few times a season; an hour-old list is fine. */
const loadCatalog = unstable_cache(() => getTeamsByCompetition(), ['onboarding-teams-by-competition'], {
  revalidate: 3600,
})

export default async function OnboardingPage() {
  let teamsByCompetition: Record<string, CatalogTeam[]> = {}
  let teamsUnavailable = false

  if (isDatabaseConfigured()) {
    try {
      teamsByCompetition = await loadCatalog()
    } catch {
      teamsUnavailable = true
    }
  } else {
    teamsUnavailable = true
  }

  return <OnboardingFlow teamsByCompetition={teamsByCompetition} teamsUnavailable={teamsUnavailable} />
}
