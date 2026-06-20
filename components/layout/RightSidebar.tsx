const WC_GROUPS = [
  {
    name: 'Group A (Mexico)',
    teams: [
      { pos: 1, name: 'Mexico', pl: 1, gd: '+2', pts: 3 },
      { pos: 2, name: 'South Korea', pl: 1, gd: '+1', pts: 3 },
      { pos: 3, name: 'Czechia', pl: 2, gd: '-1', pts: 1 },
      { pos: 4, name: 'South Africa', pl: 2, gd: '-2', pts: 1 },
    ],
  },
  {
    name: 'Group D (USA)',
    teams: [
      { pos: 1, name: 'USA', pl: 1, gd: '+3', pts: 3 },
      { pos: 2, name: 'Australia', pl: 1, gd: '+2', pts: 3 },
      { pos: 3, name: 'Türkiye', pl: 2, gd: '-2', pts: 0 },
      { pos: 4, name: 'Paraguay', pl: 2, gd: '-3', pts: 0 },
    ],
  },
]

const TOP_TRANSFERS = [
  { name: 'Jan Paul van Hecke', from: 'Brighton', to: 'Liverpool', fee: '€60M' },
  { name: 'Victor Muñoz', from: 'Villarreal', to: 'Arsenal', fee: '€40M' },
  { name: 'Afonso Moreira', from: 'Benfica', to: 'Man City', fee: '€29.5M' },
]

const NEWS = [
  { title: 'USA vs Australia: World Cup Group D Preview', time: '2h ago', source: '90Min' },
  { title: 'Scotland hope to upset Morocco in opener', time: '3h ago', source: '90Min' },
  { title: 'Mexico secure dominant opening win over South Korea', time: '1h ago', source: '90Min' },
]

export function RightSidebar() {
  return (
    <div className="py-4 flex flex-col gap-4 px-3">
      {/* World Cup Standings */}
      <div className="bg-bg-surface rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-divider">
          <span className="text-[13px] font-bold text-content-primary">FIFA World Cup</span>
          <span className="text-[11px] text-content-muted">International</span>
        </div>
        {WC_GROUPS.map((group) => (
          <div key={group.name} className="border-b border-divider last:border-0">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 px-3 py-1 text-[10px] text-content-muted font-semibold uppercase tracking-wider">
              <span>#</span>
              <span className="w-6 text-center">PL</span>
              <span className="w-6 text-center">GD</span>
              <span className="w-6 text-center">PTS</span>
            </div>
            {group.teams.map((team) => (
              <div key={team.name} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-1 items-center px-3 py-1 hover:bg-bg-elevated transition-colors">
                <span className="text-[11px] text-content-muted w-4">{team.pos}</span>
                <span className="text-[12px] text-content-primary font-medium truncate">{team.name}</span>
                <span className="text-[11px] text-content-muted w-6 text-center tabular-nums">{team.pl}</span>
                <span className="text-[11px] text-content-muted w-6 text-center tabular-nums">{team.gd}</span>
                <span className="text-[11px] text-content-primary font-bold w-6 text-center tabular-nums">{team.pts}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Top Transfers */}
      <div className="bg-bg-surface rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-divider flex items-center justify-between">
          <span className="text-[13px] font-bold text-content-primary">Top transfers</span>
          <span className="text-[11px] text-content-muted">By date</span>
        </div>
        {TOP_TRANSFERS.map((t) => (
          <div key={t.name} className="flex items-center justify-between px-3 py-2.5 hover:bg-bg-elevated transition-colors border-b border-divider last:border-0">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-content-primary truncate">{t.name}</p>
              <p className="text-[11px] text-content-muted truncate">{t.from} → {t.to}</p>
            </div>
            <span className="text-[12px] font-bold text-accent-green ml-2 shrink-0">{t.fee}</span>
          </div>
        ))}
        <div className="px-3 py-2 text-center">
          <span className="text-[12px] text-accent-green cursor-pointer hover:underline">Transfer Center</span>
        </div>
      </div>

      {/* News */}
      <div className="bg-bg-surface rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-divider">
          <span className="text-[13px] font-bold text-content-primary">News</span>
        </div>
        {NEWS.map((n) => (
          <div key={n.title} className="px-3 py-2.5 hover:bg-bg-elevated transition-colors border-b border-divider last:border-0 cursor-pointer">
            <p className="text-[12px] font-medium text-content-primary leading-4 mb-1">{n.title}</p>
            <p className="text-[11px] text-content-muted">{n.source} · {n.time}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
