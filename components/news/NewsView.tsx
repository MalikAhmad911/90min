'use client'

import { useEffect, useState } from 'react'

export interface NewsRow {
  link: string
  title: string
  summary: string
  publishedAt: string // ISO
  imageUrl: string | null
  sourceId: string
  sourceName: string
}

function ago(iso: string, now: number): string {
  const mins = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function chipClass(active: boolean): string {
  return `shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
    active ? 'bg-accent-green text-bg-primary' : 'bg-bg-surface text-content-secondary hover:text-content-primary'
  }`
}

export function NewsView({
  rows,
  sources,
  generatedAt,
}: {
  rows: NewsRow[]
  sources: { id: string; name: string }[]
  generatedAt: number
}) {
  const [source, setSource] = useState<string | null>(null)
  // Relative times use the build time on the server and the real clock after
  // hydration, so the server HTML and the first client render agree.
  const [now, setNow] = useState(generatedAt)
  useEffect(() => setNow(Date.now()), [])

  const list = source ? rows.filter((r) => r.sourceId === source) : rows

  return (
    <div className="pb-6">
      <div className="px-4 py-3 border-b border-divider">
        <h1 className="text-[15px] font-bold text-content-primary">News</h1>
        <p className="text-[11px] text-content-muted">Latest football headlines</p>
      </div>

      <div role="group" aria-label="Filter by source" className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide">
        <button type="button" onClick={() => setSource(null)} aria-pressed={!source} className={chipClass(!source)}>
          All
        </button>
        {sources.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSource(s.id)}
            aria-pressed={source === s.id}
            className={chipClass(source === s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[13px] font-medium text-content-secondary">No headlines right now</p>
          <p className="mt-1 text-[11px] text-content-muted">Check back in a few minutes.</p>
        </div>
      ) : (
        <ul className="mx-2 mt-1 space-y-2">
          {list.map((n) => (
            <li key={n.link}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex gap-3 rounded-lg bg-bg-surface p-3 hover:bg-bg-elevated transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-content-primary line-clamp-2 group-hover:text-accent-green transition-colors">
                    {n.title}
                  </p>
                  {n.summary && (
                    <p className="mt-1 text-[12px] leading-snug text-content-secondary line-clamp-2">{n.summary}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-content-muted">
                    {n.sourceName} · <time dateTime={n.publishedAt}>{ago(n.publishedAt, now)}</time>
                  </p>
                </div>
                {n.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- third-party hosts vary per feed
                  <img
                    src={n.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-16 w-24 shrink-0 rounded-md object-cover bg-bg-elevated"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-[18px] font-black text-content-muted"
                  >
                    {n.sourceName.slice(0, 1)}
                  </div>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="px-4 pt-4 text-[11px] text-content-muted">
        Headlines link to their original publishers. 90 Min Tactics does not host these articles.
      </p>
    </div>
  )
}
