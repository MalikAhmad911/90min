'use client'

import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface DateNavProps {
  selectedDate: string
  onDateChange: (date: string) => void
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

function getLabel(dateStr: string): string {
  const today = formatDate(new Date())
  const yesterday = offsetDate(today, -1)
  const tomorrow = offsetDate(today, 1)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  if (dateStr === tomorrow) return 'Tomorrow'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function DateNav({ selectedDate, onDateChange }: DateNavProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
      <button
        type="button"
        onClick={() => onDateChange(offsetDate(selectedDate, -1))}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-elevated transition-colors text-content-secondary hover:text-content-primary"
        aria-label="Previous day"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        type="button"
        className="flex items-center gap-1.5 text-[15px] font-semibold text-content-primary hover:text-content-secondary transition-colors"
      >
        {getLabel(selectedDate)}
        <ChevronDown size={14} className="text-content-muted" />
      </button>

      <button
        type="button"
        onClick={() => onDateChange(offsetDate(selectedDate, 1))}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-elevated transition-colors text-content-secondary hover:text-content-primary"
        aria-label="Next day"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
