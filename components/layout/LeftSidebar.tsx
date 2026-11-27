'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FREE_COMPETITIONS } from '@/lib/competitions'
import { Crest } from '@/components/ui/Crest'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { useFollowSummary } from '@/hooks/useFollows'

/**
 * Sidebar order: the competitions people look for first.
 *
 * These are the real football-data codes, so every link resolves to a page
 * with a table behind it. The previous list mixed up ids and names (it had
 * the Europa League pointing at the Euros id, and the Championship labelled
 * "FA Cup"), and linked to competitions the free plan does not serve.
 */
const SIDEBAR_ORDER = ['WC', 'PL', 'CL', 'PD', 'BL1', 'SA', 'FL1', 'ELC', 'DED', 'PPL', 'BSA', 'EC']

const TOP_LEAGUES = SIDEBAR_ORDER.map((code) =>
  FREE_COMPETITIONS.find((c) => c.code === code)
).filter((c): c is (typeof FREE_COMPETITIONS)[number] => Boolean(c))

export function LeftSidebar() {
  const pathname = usePathname()
  // Only rendered when the device follows teams; nothing shows while loading.
  const { summary } = useFollowSummary()
  const followedTeams = summary?.teams ?? []

  return (
    <div className="py-4">
      {followedTeams.length > 0 && (
        <div className="mb-4">
          <div className="px-4 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-content-muted">
              Following
            </span>
          </div>
          <nav aria-label="Followed teams" className="flex flex-col">
            {followedTeams.map((team) => {
              const href = `/team/${team.id}`
              const active = pathname === href
              return (
                <Link
                  key={team.id}
                  href={href}
                  className={`flex items-center gap-3 px-4 py-2 transition-colors group ${
                    active ? 'bg-bg-elevated' : 'hover:bg-bg-elevated'
                  }`}
                >
                  <TeamCrest src={team.crest} name={team.name} size={20} />
                  <span className="text-[13px] truncate text-content-secondary group-hover:text-content-primary">
                    {team.shortName}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      <div className="px-4 mb-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-content-muted">
          Top leagues
        </span>
      </div>

      <nav className="flex flex-col">
        {TOP_LEAGUES.map((competition) => {
          const href = `/leagues/${competition.code}`
          const active = pathname === href

          return (
            <Link
              key={competition.code}
              href={href}
              className={`flex items-center gap-3 px-4 py-2 transition-colors group ${
                active ? 'bg-bg-elevated' : 'hover:bg-bg-elevated'
              }`}
            >
              <Crest
                src={competition.emblem}
                name={competition.name}
                size={20}
                fallbackText={competition.flag}
              />
              <span
                className={`text-[13px] truncate transition-colors ${
                  active
                    ? 'text-content-primary font-medium'
                    : 'text-content-secondary group-hover:text-content-primary'
                }`}
              >
                {competition.shortName}
              </span>
            </Link>
          )
        })}
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
