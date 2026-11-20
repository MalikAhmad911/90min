'use client'


import { formatDate } from '@/lib/utils'

interface DateStripProps {
  selectedDate: string
  onDateChange: (date: string) => void
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildDates(): { label: string; date: string }[] {
  const result = []
  for (let i = -3; i <= 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const date = formatDate(d)
    let label: string
    if (i === -1) label = 'Yesterday'
    else if (i === 0) label = 'Today'
    else if (i === 1) label = 'Tomorrow'
    else label = `${DAYS[d.getDay()]} ${d.getDate()}`
    result.push({ label, date })
  }
  return result
}

export function DateStrip({ selectedDate, onDateChange }: DateStripProps) {
  const dates = buildDates()

  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-hide px-4 py-3 border-b border-divider">
      {dates.map(({ label, date }) => {
        const isSelected = date === selectedDate
        return (
          <button
            key={date}
            onClick={() => onDateChange(date)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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
