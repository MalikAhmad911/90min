'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Trophy, Tv, Star, MoreHorizontal } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Scores', Icon: Activity },
  { href: '/leagues', label: 'Leagues', Icon: Trophy },
  { href: '/watch', label: 'Watch', Icon: Tv },
  { href: '/following', label: 'Following', Icon: Star },
  { href: '/more', label: 'More', Icon: MoreHorizontal },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-divider">
      <div className="flex items-stretch">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                active ? 'text-accent-green' : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              <span>{label}</span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent-green rounded-t-full" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
