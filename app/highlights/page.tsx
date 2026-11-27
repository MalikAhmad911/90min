import type { Metadata } from 'next'
import Link from 'next/link'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import { HIGHLIGHT_COMPETITIONS } from '@/lib/highlights/channels'
import { getLatestHighlights } from '@/lib/highlights/fetch'
import { HighlightPlayer } from '@/components/highlights/HighlightPlayer'
import { Crest } from '@/components/ui/Crest'

export const revalidate = 1800

const TITLE = 'Football Highlights – Official Videos | 90 Min Tactics'
const DESCRIPTION =
  'Watch the latest official football highlights from the Premier League, LaLiga, Bundesliga, Serie A, Ligue 1 and more.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/highlights' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/highlights' },
}

function ago(date: Date): string {
  const mins = Math.max(1, Math.round((Date.now() - date.getTime()) / 60_000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default async function HighlightsPage({
  searchParams,
}: {
  searchParams: { competition?: string }
}) {
  const requested = searchParams.competition?.toUpperCase()
  const competition = requested && HIGHLIGHT_COMPETITIONS.includes(requested) ? requested : undefined
  const videos = await getLatestHighlights({ competition, limit: 36 })
  const chips = FREE_COMPETITIONS.filter((c) => HIGHLIGHT_COMPETITIONS.includes(c.code))

  return (
    <div className="pb-6">
      <div className="px-4 py-3 border-b border-divider">
        <h1 className="text-[15px] font-bold text-content-primary">Highlights</h1>
        <p className="text-[11px] text-content-muted">Official videos from the leagues&apos; own channels</p>
      </div>

      <nav aria-label="Filter by competition" className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide">
        <Link
          href="/highlights"
          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
            !competition
              ? 'bg-accent-green text-bg-primary'
              : 'bg-bg-surface text-content-secondary hover:text-content-primary'
          }`}
        >
          All
        </Link>
        {chips.map((c) => (
          <Link
            key={c.code}
            href={`/highlights?competition=${c.code}`}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              competition === c.code
                ? 'bg-accent-green text-bg-primary'
                : 'bg-bg-surface text-content-secondary hover:text-content-primary'
            }`}
          >
            <Crest src={c.emblem} name={c.name} size={14} />
            {c.name}
          </Link>
        ))}
      </nav>

      {videos.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[13px] font-medium text-content-secondary">No highlights right now</p>
          <p className="mt-1 text-[11px] text-content-muted">Check back after the next round of matches.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2">
          {videos.map((v) => (
            <HighlightPlayer
              key={v.videoId}
              videoId={v.videoId}
              title={v.title}
              channelName={v.channelName}
              publishedLabel={ago(v.publishedAt)}
            />
          ))}
        </div>
      )}

      <p className="px-4 pt-4 text-[11px] text-content-muted">
        Videos are embedded from official YouTube channels. Some may be unavailable in your country.
      </p>
    </div>
  )
}
