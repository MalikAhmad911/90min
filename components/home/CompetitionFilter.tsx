'use client'

import { FREE_COMPETITIONS } from '@/lib/competitions'
import { CURATED_ORDER } from '@/lib/home-order'
import { Crest } from '@/components/ui/Crest'

const ORDERED = CURATED_ORDER.map((code) => FREE_COMPETITIONS.find((c) => c.code === code)).filter(
  (c): c is (typeof FREE_COMPETITIONS)[number] => Boolean(c)
)

interface CompetitionFilterProps {
  id: string
  hidden: ReadonlySet<string>
  onToggle: (code: string) => void
  onShowAll: () => void
  onClose: () => void
}

/**
 * The Filter button's panel: show or hide whole competitions in the feed.
 * Checkboxes rather than a custom listbox - native semantics, native keys.
 */
export function CompetitionFilter({ id, hidden, onToggle, onShowAll, onClose }: CompetitionFilterProps) {
  return (
    <div
      id={id}
      className="border-b border-divider bg-bg-surface px-4 py-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-widest text-content-muted mb-2">
          Competitions shown
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {ORDERED.map((c) => {
            const shown = !hidden.has(c.code)
            return (
              <label
                key={c.code}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-bg-elevated"
              >
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={() => onToggle(c.code)}
                  className="h-4 w-4 accent-accent-green"
                />
                <Crest src={c.emblem} name={c.name} size={18} fallbackText={c.flag} />
                <span className="text-[13px] text-content-primary truncate">{c.name}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-content-muted">
          Matches of teams you follow always show.
        </p>
        <div className="flex gap-2">
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={onShowAll}
              className="rounded-full px-3 py-1 text-[12px] font-medium text-content-secondary hover:text-content-primary hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
            >
              Show all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-bg-elevated px-3 py-1 text-[12px] font-semibold text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
