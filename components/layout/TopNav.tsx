'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Search, Settings } from 'lucide-react'
import { SearchCombobox } from '@/components/search/SearchCombobox'
import { MobileSearchSheet } from '@/components/search/MobileSearchSheet'

const NAV_LINKS = [
  { href: '/watch', label: 'Watch' },
  { href: '/highlights', label: 'Highlights' },
  { href: '/news', label: 'News' },
  { href: '/transfers', label: 'Transfers' },
  { href: '/more', label: 'About' },
]

export function TopNav() {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetButtonRef = useRef<HTMLButtonElement>(null)
  const sheetWasOpen = useRef(false)

  const closeSheet = useCallback(() => setSheetOpen(false), [])

  // Any navigation (including the browser's back button) dismisses the sheet.
  useEffect(() => {
    setSheetOpen(false)
  }, [pathname])

  // Return focus to the button that opened the sheet, as a modal should.
  useEffect(() => {
    if (sheetWasOpen.current && !sheetOpen) sheetButtonRef.current?.focus()
    sheetWasOpen.current = sheetOpen
  }, [sheetOpen])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-bg-primary border-b border-divider h-14">
      <div className="max-w-[1100px] mx-auto h-full flex items-center gap-4 px-4">

        {/* Logo */}
        <Link href="/" aria-label="90 Min Tactics home" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.svg" alt="" width={32} height={32} priority className="h-8 w-8 shrink-0" />
          <span className="flex flex-col justify-center leading-none" aria-hidden="true">
            <span className="font-black text-[15px] tracking-tight">
              <span className="text-accent-green">90</span>
              <span className="text-content-primary">MIN</span>
            </span>
            <span className="mt-0.5 text-[8px] font-bold tracking-[0.34em] text-content-muted">
              TACTICS
            </span>
          </span>
        </Link>

        {/* Search — FotMob style type-ahead (PRD SR-1). Inline from md up. */}
        <div className="flex-1 max-w-xs hidden md:block">
          <SearchCombobox />
        </div>

        {/* Phones: the field does not fit, so an icon opens a full-screen sheet. */}
        <button
          ref={sheetButtonRef}
          type="button"
          aria-label="Search"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
          className="md:hidden ml-auto p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors"
        >
          <Search size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>

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

      <MobileSearchSheet open={sheetOpen} onClose={closeSheet} />
    </header>
  )
}
