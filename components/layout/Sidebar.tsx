import Link from 'next/link'

const TOP_LEAGUES = [
  { id: 2021, name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 2014, name: 'La Liga', flag: '🇪🇸' },
  { id: 2002, name: 'Bundesliga', flag: '🇩🇪' },
  { id: 2019, name: 'Serie A', flag: '🇮🇹' },
  { id: 2015, name: 'Ligue 1', flag: '🇫🇷' },
  { id: 2001, name: 'Champions League', flag: '🇪🇺' },
  { id: 2018, name: 'Europa League', flag: '🇪🇺' },
]

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-bg-surface border-r border-divider min-h-screen pt-4">
      <div className="px-3 mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted px-2 mb-1">
          Top Leagues
        </h2>
        <nav className="flex flex-col gap-0.5">
          {TOP_LEAGUES.map(({ id, name, flag }) => (
            <Link
              key={id}
              href={`/leagues/${id}`}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
            >
              <span className="text-base leading-none">{flag}</span>
              <span className="truncate">{name}</span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  )
}
