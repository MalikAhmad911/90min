'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { addDays } from '@/lib/timezone'
import { formatDate, relativeDayLabel } from '@/lib/utils'

interface DateNavProps {
  selectedDate: string
  /**
   * Today in the user's time zone - the anchor for Today/Yesterday/Tomorrow.
   * Optional for older callers (watch, admin), which get the UTC date as before.
   */
  today?: string
  onDateChange: (date: string) => void
}

/** How far the calendar reaches: enough for a season either way. */
const CALENDAR_SPAN_DAYS = 365

/**
 * `< Today ▾ >`. The middle control opens a calendar (a native date input:
 * keyboard and screen-reader support come for free) for jumping beyond the
 * ±7-day strip (PRD MAT-6).
 */
export function DateNav({ selectedDate, today: todayProp, onDateChange }: DateNavProps) {
  const today = todayProp ?? formatDate(new Date())
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const input = inputRef.current
    input?.focus()
    // Open the native picker straight away where the browser allows it.
    try {
      input?.showPicker?.()
    } catch {
      // not allowed here (e.g. no user activation) - the focused input still works
    }
  }, [open])

  const close = () => {
    setOpen(false)
    toggleRef.current?.focus()
  }

  return (
    <div className="border-b border-divider">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => onDateChange(addDays(selectedDate, -1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-elevated transition-colors text-content-secondary hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          aria-label="Previous day"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${relativeDayLabel(selectedDate, today)}, choose a date`}
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-semibold text-content-primary hover:bg-bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
        >
          {relativeDayLabel(selectedDate, today)}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`text-content-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        <button
          type="button"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-elevated transition-colors text-content-secondary hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          aria-label="Next day"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          className="flex flex-wrap items-center justify-center gap-2 px-4 pb-3"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            }
          }}
        >
          <label className="flex items-center gap-2 text-[13px] text-content-secondary">
            Go to date
            <input
              ref={inputRef}
              type="date"
              value={selectedDate}
              min={addDays(today, -CALENDAR_SPAN_DAYS)}
              max={addDays(today, CALENDAR_SPAN_DAYS)}
              onChange={(e) => {
                // Cleared or partial input yields '' - ignore until it is a full date.
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                  onDateChange(e.target.value)
                  close()
                }
              }}
              className="rounded-md border border-divider bg-bg-elevated px-2 py-1 text-content-primary [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
            />
          </label>
          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => {
                onDateChange(today)
                close()
              }}
              className="rounded-full bg-bg-elevated px-3 py-1 text-[12px] font-medium text-content-secondary hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
            >
              Back to today
            </button>
          )}
        </div>
      )}
    </div>
  )
}
