'use client'

import Link from 'next/link'
import Image from 'next/image'

const TOP_LEAGUES = [
  { id: 2000, code: 'WC', name: 'FIFA World Cup', emblem: 'https://crests.football-data.org/wm26.png' },
  { id: 2021, code: 'PL', name: 'Premier League', emblem: 'https://crests.football-data.org/PL.png' },
  { id: 2001, code: 'CL', name: 'Champions League', emblem: 'https://crests.football-data.org/CL.png' },
  { id: 2014, code: 'PD', name: 'LaLiga', emblem: 'https://crests.football-data.org/PD.png' },
  { id: 2002, code: 'BL1', name: 'Bundesliga', emblem: 'https://crests.football-data.org/BL1.png' },
  { id: 2018, code: 'EL', name: 'Europa League', emblem: 'https://crests.football-data.org/EL.png' },
  { id: 2015, code: 'FL1', name: 'Ligue 1', emblem: 'https://crests.football-data.org/FL1.png' },
  { id: 2019, code: 'SA', name: 'Serie A', emblem: 'https://crests.football-data.org/SA.png' },
  { id: 2139, code: 'CDR', name: 'Copa del Rey', emblem: 'https://crests.football-data.org/CDR.png' },
  { id: 2055, code: 'ELC', name: 'FA Cup', emblem: 'https://crests.football-data.org/ELC.png' },
]

export function LeftSidebar() {
  return (
    <div className="py-4">
      <div className="px-4 mb-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-content-muted">
          Top leagues
        </span>
      </div>

      <nav className="flex flex-col">
        {TOP_LEAGUES.map(({ id, name, emblem }) => (
          <Link
            key={id}
            href={`/leagues/${id}`}
            className="flex items-center gap-3 px-4 py-2 hover:bg-bg-elevated transition-colors group"
          >
            <div className="relative w-5 h-5 shrink-0">
              <Image
                src={emblem}
                alt={name}
                fill
                sizes="20px"
                className="object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
              />
            </div>
            <span className="text-[13px] text-content-secondary group-hover:text-content-primary transition-colors truncate">
              {name}
            </span>
          </Link>
        ))}
      </nav>

      <div className="px-4 mt-3">
        <Link
          href="/leagues"
          className="flex items-center gap-1.5 text-[13px] text-content-secondary hover:text-content-primary transition-colors"
        >
          <span>All leagues</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 7L1 3h8L5 7z" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
