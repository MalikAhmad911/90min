/**
 * The site's public origin, for canonical URLs, the sitemap and robots.txt.
 *
 * Order of preference:
 *   1. NEXT_PUBLIC_SITE_URL - set explicitly when the site has a custom domain.
 *   2. URL                  - Netlify sets this to the site's main address.
 *   3. http://localhost:3000 - local development.
 *
 * A value that is not an absolute http(s) URL is skipped rather than trusted:
 * a typo in an env var must not put `javascript:` or a relative path into
 * every canonical link on the site.
 */

export const SITE_NAME = '90 Min Tactics'

const FALLBACK_ORIGIN = 'http://localhost:3000'

function toOrigin(candidate: string | undefined): string | null {
  if (!candidate) return null
  try {
    const url = new URL(candidate.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Keep a path prefix if the site is served from one, but never a trailing slash,
    // so `${origin}/match/1` never produces a double slash.
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function getSiteUrl(env: Record<string, string | undefined> = process.env): string {
  return toOrigin(env.NEXT_PUBLIC_SITE_URL) ?? toOrigin(env.URL) ?? FALLBACK_ORIGIN
}

/** Absolute URL for a site path such as `/match/123`. */
export function absoluteUrl(path: string, env?: Record<string, string | undefined>): string {
  const base = getSiteUrl(env)
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Site paths for each entity, kept in one place so links, canonicals and the sitemap agree. */
export const paths = {
  match: (id: number | string) => `/match/${id}`,
  team: (id: number | string) => `/team/${id}`,
  competition: (code: string) => `/leagues/${code}`,
}
