import Link from 'next/link'
import { Search } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function TopNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-bg-surface border-b border-divider h-14">
      <div className="max-w-screen-xl mx-auto px-4 h-full flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex items-center">
            <span className="text-accent-green font-black text-2xl leading-none">90</span>
            <span className="text-content-primary font-black text-lg leading-none">MIN</span>
          </div>
          <span className="text-content-secondary font-semibold text-xs tracking-widest uppercase hidden sm:block">
            Tactics
          </span>
        </Link>

        {/* Nav links — hidden on mobile */}
        <nav className="hidden lg:flex items-center gap-1">
          {[
            { href: '/', label: 'Scores' },
            { href: '/leagues', label: 'Leagues' },
            { href: '/news', label: 'News' },
            { href: '/transfers', label: 'Transfers' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-bg-elevated transition-colors" aria-label="Search">
            <Search size={18} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
