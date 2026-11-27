import Link from 'next/link'
import type { Metadata } from 'next'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import { Crest } from '@/components/ui/Crest'

export const metadata: Metadata = {
  title: 'Leagues | 90 Min Tactics',
  description: 'League tables, fixtures and top scorers.',
  alternates: { canonical: '/leagues' },
}

export default function LeaguesPage() {
  return (
    <div>
      <div className="px-4 py-3 border-b border-divider">
        <h1 className="text-[15px] font-bold text-content-primary">Leagues</h1>
        <p className="text-[11px] text-content-muted mt-0.5">
          Tables, fixtures and top scorers
        </p>
      </div>

      <div className="mt-2 mx-2 mb-3 bg-bg-surface rounded-lg overflow-hidden">
        <div className="divide-y divide-divider">
          {FREE_COMPETITIONS.map((competition) => (
            <Link
              key={competition.code}
              href={`/leagues/${competition.code}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-elevated transition-colors group"
            >
              <Crest
                src={competition.emblem}
                name={competition.name}
                size={24}
                fallbackText={competition.flag}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-content-primary font-medium truncate group-hover:text-accent-green transition-colors">
                  {competition.name}
                </span>
                <span className="block text-[11px] text-content-muted truncate">
                  {competition.flag} {competition.country}
                </span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted shrink-0">
                {competition.code}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
