'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { SearchCombobox } from './SearchCombobox'

/**
 * Full-screen search for phones, where the header has no room for a field.
 *
 * A modal dialog: the page behind it does not scroll, Tab cycles inside it,
 * Escape or the back arrow closes it, and the caller gets focus back on the
 * button that opened it (see TopNav).
 */

interface MobileSearchSheetProps {
  open: boolean
  onClose: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function MobileSearchSheet({ open, onClose }: MobileSearchSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Lock the page behind the sheet while it is open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // The sheet is mobile-only (md:hidden). If the viewport grows past that while
  // it is open, close it rather than leave the page scroll-locked behind an
  // invisible dialog.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (mq.matches) onClose()
    }
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [open, onClose])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && e.target === e.currentTarget) {
      onClose()
      return
    }
    if (e.key !== 'Tab' || !dialogRef.current) return
    // Minimal focus trap: wrap Tab / Shift+Tab at the ends.
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Portalled to <body>: rendered inside the fixed header it would share the
  // header's z-50 stacking context, and the BottomNav (also z-50, later in the
  // DOM) would paint over the sheet.
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] flex flex-col bg-bg-primary md:hidden"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-divider px-3">
        <button
          type="button"
          aria-label="Close search"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
          className="rounded-lg p-2 text-content-secondary hover:bg-bg-elevated hover:text-content-primary"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <SearchCombobox variant="sheet" autoFocus onNavigate={onClose} onEscape={onClose} />
        </div>
      </div>
    </div>,
    document.body
  )
}
