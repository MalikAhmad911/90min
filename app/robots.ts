import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo/site'

/**
 * /api is disallowed because the pages are server-rendered: crawlers get the
 * content from the HTML and have no reason to spend crawl budget (or our
 * provider quota, via read-through refreshes) on the JSON endpoints.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/login'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
