'use client'

import { CalendarDays } from 'lucide-react'
import { addDays } from '@/lib/timezone'
import { formatDate, formatYmd } from '@/lib/utils'

/**
 * What a day with no football should look like.
 *
 * A bare "no matches" reads as a broken app, and most empty days have a plain
 * cause: domestic leagues stop for international breaks, and the free plan
 * does not carry those national-team fixtures. So say that, and hand the user
 * somewhere to go - the next weekend is almost always full.
 */

/** The next Saturday strictly after `dateStr`. */
function nextSaturday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const delta = ((6 - weekday + 7) % 7) || 7
  return addDays(dateStr, delta)
}

function label(dateStr: string): string {
  return formatYmd(dateStr, { weekday: 'short', day: 'numeric', month: 'short' })
}

interface EmptyDayProps {
  date: string
  onDateChange: (date: string) => void
  /** Set when a filter is active, so we can say so instead of blaming the calendar. */
  filterLabel?: string
  /** Overrides the filter sentence entirely, e.g. for hidden competitions. */
  filterMessage?: string
  /** Today in the user's zone. Defaults to the UTC date for older callers. */
  today?: string
}

export function EmptyDay({ date, onDateChange, filterLabel, filterMessage, today: todayProp }: EmptyDayProps) {
  const today = todayProp ?? formatDate(new Date())
  const saturday = nextSaturday(date)

  const suggestions = [
    { key: 'today', date: today, text: 'Today' },
    { key: 'tomorrow', date: addDays(today, 1), text: 'Tomorrow' },
    { key: 'saturday', date: saturday, text: label(saturday) },
  ].filter((s, i, all) => s.date !== date && all.findIndex((x) => x.date === s.date) === i)

  if (filterLabel || filterMessage) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <CalendarDays size={28} className="text-content-muted mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-content-secondary">
          {filterMessage ?? `No ${filterLabel!.toLowerCase()} matches`}
        </p>
        <p className="text-xs text-content-muted mt-1">
          There are matches on this date — clear the filter to see them.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <CalendarDays size={28} className="text-content-muted mb-3" aria-hidden="true" />
      <p className="text-sm font-medium text-content-secondary">No matches on this date</p>
      <p className="text-xs text-content-muted mt-1.5 max-w-xs leading-relaxed">
        Domestic leagues pause during international breaks, and national-team fixtures are not
        covered here. Weekends are usually busy.
      </p>

      {suggestions.length > 0 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onDateChange(s.date)}
              className="px-3 py-1.5 rounded-full bg-bg-elevated text-content-secondary text-[12px] font-medium hover:text-content-primary hover:bg-bg-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green transition-colors"
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
