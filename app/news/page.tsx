import type { Metadata } from 'next'
import { NEWS_SOURCES } from '@/lib/news/sources'
import { getLatestNews } from '@/lib/news/fetch'
import { NewsView, type NewsRow } from '@/components/news/NewsView'

export const revalidate = 1800

const TITLE = 'Football News – Latest Headlines | 90 Min Tactics'
const DESCRIPTION = 'The latest football headlines from around the world, updated every 30 minutes.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/news' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/news' },
}

export default async function NewsPage() {
  const now = new Date()
  const items = await getLatestNews(now)
  const rows: NewsRow[] = items.map((n) => ({
    link: n.link,
    title: n.title,
    summary: n.summary,
    publishedAt: n.publishedAt.toISOString(),
    imageUrl: n.imageUrl,
    sourceId: n.sourceId,
    sourceName: n.sourceName,
  }))
  const present = new Set(rows.map((r) => r.sourceId))
  const sources = NEWS_SOURCES.filter((s) => present.has(s.id)).map((s) => ({ id: s.id, name: s.name }))

  return <NewsView rows={rows} sources={sources} generatedAt={now.getTime()} />
}
