import type { MetadataRoute } from 'next'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import { isDatabaseConfigured } from '@/lib/db'
import { getSitemapMatches, getSitemapTeams } from '@/lib/db/seo-queries'
import { absoluteUrl, paths } from '@/lib/seo/site'

/** Regenerated at most hourly; crawlers do not re-read sitemaps faster than that. */
export const revalidate = 3600

const DAY = 24 * 60 * 60 * 1000

/**
 * Matches are limited to a window around today. Old results are still
 * reachable through team and league pages; listing every match ever played
 * would only grow the file towards the 50,000-URL limit without helping
 * discovery of the pages people actually search for.
 */
const MATCH_WINDOW_DAYS = 60

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'always', priority: 1 },
    { url: absoluteUrl('/leagues'), changeFrequency: 'weekly', priority: 0.6 },
    ...FREE_COMPETITIONS.map((c) => ({
      url: absoluteUrl(paths.competition(c.code)),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]

  if (!isDatabaseConfigured()) return entries

  try {
    const now = Date.now()
    const [teams, matches] = await Promise.all([
      getSitemapTeams(),
      getSitemapMatches(new Date(now - MATCH_WINDOW_DAYS * DAY), new Date(now + MATCH_WINDOW_DAYS * DAY)),
    ])

    for (const t of teams) {
      entries.push({
        url: absoluteUrl(paths.team(t.id)),
        ...(t.lastModified ? { lastModified: t.lastModified } : {}),
        changeFrequency: 'daily',
        priority: 0.7,
      })
    }
    for (const m of matches) {
      entries.push({
        url: absoluteUrl(paths.match(m.id)),
        ...(m.lastModified ? { lastModified: m.lastModified } : {}),
        changeFrequency: 'hourly',
        priority: 0.5,
      })
    }
  } catch (err) {
    // A sitemap with only the static pages beats a 500 that makes crawlers back off.
    console.error('[seo] sitemap database read failed:', err)
  }

  return entries
}
