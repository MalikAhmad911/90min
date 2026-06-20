'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Search, Settings } from 'lucide-react'

const NAV_LINKS = [
  { href: '/watch', label: 'Watch' },
  { href: '/news', label: 'News' },
  { href: '/transfers', label: 'Transfers' },
  { href: '/more', label: 'About' },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-bg-primary border-b border-divider h-14">
      <div className="max-w-[1100px] mx-auto h-full flex items-center gap-4 px-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="relative w-8 h-8">
            <Image
              src="/logo.svg"
              alt="90 Min Tactics"
              fill
              sizes="32px"
              className="object-contain"
              priority
            />
          </div>
          <span className="hidden sm:block font-black text-sm tracking-[0.15em] uppercase text-content-primary">
            90MIN
          </span>
        </Link>

        {/* Search bar — FotMob style, wide, centered */}
        <div className="flex-1 max-w-xs hidden md:block">
          <div className="flex items-center gap-2 bg-bg-elevated rounded-full px-3 py-1.5 text-content-muted hover:bg-bg-elevated/80 transition-colors cursor-pointer">
            <Search size={14} strokeWidth={2} />
            <span className="text-sm text-content-muted">Search</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="hidden lg:flex items-center gap-0.5 ml-auto">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
                  active ? 'text-content-primary' : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Settings */}
        <button
          type="button"
          aria-label="Settings"
          className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors ml-1"
        >
          <Settings size={17} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  )
}
