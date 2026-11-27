'use client'

import { useEffect, useRef } from 'react'
import { addDays } from '@/lib/timezone'
import { formatYmd, relativeDayLabel } from '@/lib/utils'

interface DateStripProps {
  selectedDate: string
  /** Today in the user's time zone. */
  today: string
  onDateChange: (date: string) => void
  /** Days either side of today. PRD MAT-6 asks for ±7. */
  span?: number
}

/** The ±N days around `today`, labelled relative to it. Exported for tests. */
export function buildStripDates(today: string, span = 7): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = []
  for (let i = -span; i <= span; i++) {
    const date = addDays(today, i)
    out.push({ date, label: relativeDayLabel(date, today) })
  }
  return out
}

export function DateStrip({ selectedDate, today, onDateChange, span = 7 }: DateStripProps) {
  const dates = buildStripDates(today, span)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Keep the chosen day in view when it changes (the strip scrolls sideways).
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [selectedDate])

  return (
    <div
      role="group"
      aria-label="Choose a day"
      className="flex gap-1 overflow-x-auto scrollbar-hide px-3 py-2 border-b border-divider"
    >
      {dates.map(({ label, date }) => {
        const isSelected = date === selectedDate
        return (
          <button
            key={date}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            onClick={() => onDateChange(date)}
            aria-pressed={isSelected}
            aria-label={formatYmd(date, { weekday: 'long', day: 'numeric', month: 'long' })}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green ${
              isSelected
                ? 'bg-accent-green text-bg-primary font-bold'
                : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
