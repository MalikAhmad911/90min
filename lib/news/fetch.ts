import { NEWS_SOURCES, type NewsSource } from './sources'
import { parseRss, type FeedItem } from './rss'

/**
 * Latest headlines across the news sources. Server-only.
 *
 * Feeds sit in Next's data cache for 30 minutes, so each publisher is asked at
 * most twice an hour whatever our traffic. Nothing is stored in our database.
 */

export const NEWS_REVALIDATE_SECONDS = 30 * 60
const USER_AGENT = '90MinTactics/1.0 (football scores app)'
const TIMEOUT_MS = 10_000
const MAX_BYTES = 3 * 1024 * 1024
/** Feeds sometimes carry year-old posts; a news page should not. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface NewsItem extends FeedItem {
  sourceId: string
  sourceName: string
}

async function fetchSource(source: NewsSource): Promise<NewsItem[]> {
  try {
    const res = await fetch(source.feedUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: NEWS_REVALIDATE_SECONDS },
    })
    if (!res.ok) return []
    const xml = await res.text()
    if (xml.length > MAX_BYTES) return []
    return parseRss(xml, 40).map((item) => ({ ...item, sourceId: source.id, sourceName: source.name }))
  } catch {
    return []
  }
}

/** Newest first; one failing feed never empties the page. */
export async function getLatestNews(now = new Date(), limit = 80): Promise<NewsItem[]> {
  const lists = await Promise.all(NEWS_SOURCES.map(fetchSource))
  const cutoff = now.getTime() - MAX_AGE_MS
  const future = now.getTime() + 60 * 60 * 1000
  return lists
    .flat()
    .filter((n) => n.publishedAt.getTime() >= cutoff && n.publishedAt.getTime() <= future)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit)
}
