'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const NAV_LINKS = [
  { href: '/', label: 'Scores' },
  { href: '/leagues', label: 'Leagues' },
  { href: '/news', label: 'News' },
  { href: '/transfers', label: 'Transfers' },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-bg-surface border-b border-divider h-14">
      <div className="max-w-screen-xl mx-auto px-4 h-full flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="relative w-9 h-9">
            <Image
              src="/logo.svg"
              alt="90 Min Tactics"
              fill
              sizes="36px"
              className="object-contain"
              priority
            />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-content-primary font-black text-sm tracking-widest uppercase">
              90MIN
            </span>
            <span className="text-accent-green font-bold text-[10px] tracking-[0.2em] uppercase">
              Tactics
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors relative ${
                  active
                    ? 'text-content-primary'
                    : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent-green rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
            aria-label="Search"
          >
            <Search size={18} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
