'use client'

import { useId, useMemo, useState } from 'react'
import { SlidersHorizontal, Star, ChevronUp } from 'lucide-react'
import { DateNav } from './DateNav'
import { DateStrip } from './DateStrip'
import { LeagueGroup } from './LeagueGroup'
import { MatchCard } from './MatchCard'
import { SkeletonMatchCard } from './SkeletonMatchCard'
import { EmptyDay } from './EmptyDay'
import { CompetitionFilter } from './CompetitionFilter'
import { PersonaliseBanner } from './PersonaliseBanner'
import { usePersistentSet } from './usePersistentSet'
import { useDayMatches, useLocalToday, usePreferredTimeZone } from '@/hooks/useDayMatches'
import { useFollows } from '@/hooks/useFollows'
import { FEED_MODES, buildFeed, followIndexFrom, type FeedMode } from '@/lib/home-order'
import { isLive } from '@/lib/utils'
import type { Match } from '@/lib/types'

const COLLAPSED_KEY = '90min:home:collapsed'
const HIDDEN_KEY = '90min:home:hidden-competitions'
/** Collapse key for the pinned section; cannot clash with a competition code. */
const FOLLOWING_SECTION = '__following'

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2 mt-2 px-2" aria-busy="true" aria-label="Loading matches">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-bg-surface rounded-lg overflow-hidden">
          <div className="h-9 bg-bg-elevated mx-4 my-2 rounded animate-pulse" />
          {Array.from({ length: 3 }).map((_, j) => (
            <SkeletonMatchCard key={j} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function HomeFeed() {
  const { tz } = usePreferredTimeZone()
  const today = useLocalToday(tz)
  const [chosenDate, setChosenDate] = useState<string | null>(null)
  // Until the user picks a day, follow "today" - including across local midnight.
  const selectedDate = chosenDate ?? today

  const [mode, setMode] = useState<FeedMode>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterPanelId = useId()
  const collapsed = usePersistentSet(COLLAPSED_KEY)
  const hidden = usePersistentSet(HIDDEN_KEY)

  const { matches, isLoading, error, retry } = useDayMatches(selectedDate, tz)
  const { follows, ready: followsReady } = useFollows()
  const followIndex = useMemo(() => followIndexFrom(follows), [follows])

  const liveCount = useMemo(() => matches.filter((m) => isLive(m.status)).length, [matches])
  const feed = useMemo(
    () => buildFeed(matches, followIndex, { mode, hidden: hidden.values }),
    [matches, followIndex, mode, hidden.values]
  )

  const emptyFilterMessage =
    matches.length === 0
      ? undefined
      : mode === 'live'
        ? 'No live matches right now'
        : hidden.values.size > 0
          ? 'No matches in the competitions you show'
          : undefined

  return (
    <div>
      {today && selectedDate ? (
        <>
          <DateNav selectedDate={selectedDate} today={today} onDateChange={setChosenDate} />
          <DateStrip selectedDate={selectedDate} today={today} onDateChange={setChosenDate} />
        </>
      ) : (
        // Same height as the real controls, so nothing jumps once the zone is known.
        <div className="h-[106px] border-b border-divider" aria-hidden="true" />
      )}

      {/* Feed modes (PRD MAT-3) and the competition picker */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-divider overflow-x-auto scrollbar-hide">
        <div role="group" aria-label="Show" className="flex items-center gap-1">
          {FEED_MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green ${
                mode === id
                  ? 'bg-accent-green text-bg-primary font-semibold'
                  : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
              }`}
            >
              {label}
              {id === 'live' && liveCount > 0 && (
                <span
                  className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-live-red text-white text-[9px] font-black"
                  aria-label={`${liveCount} live`}
                >
                  {liveCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          aria-expanded={filterOpen}
          aria-controls={filterPanelId}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] transition-colors ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green ${
            hidden.values.size > 0
              ? 'text-accent-green bg-bg-elevated font-semibold'
              : 'text-content-secondary hover:text-content-primary hover:bg-bg-elevated'
          }`}
        >
          <SlidersHorizontal size={13} aria-hidden="true" />
          Filter
          {hidden.values.size > 0 && <span className="sr-only">({hidden.values.size} competitions hidden)</span>}
        </button>
      </div>

      {filterOpen && (
        <CompetitionFilter
          id={filterPanelId}
          hidden={hidden.values}
          onToggle={hidden.toggle}
          onShowAll={() => hidden.replace([])}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {followsReady && <PersonaliseBanner hasFollows={follows.length > 0} />}

      {/* Loading */}
      {isLoading && matches.length === 0 && <FeedSkeleton />}

      {/* Error */}
      {!isLoading && error && (
        <div role="alert" className="flex flex-col items-center justify-center py-16 text-content-muted">
          <p className="text-sm font-medium text-content-secondary">Could not load matches</p>
          <p className="text-xs mt-1">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-full bg-bg-elevated px-3 py-1.5 text-[12px] font-medium text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && selectedDate && feed.total === 0 && (
        <EmptyDay
          date={selectedDate}
          today={today ?? undefined}
          onDateChange={setChosenDate}
          // Only blame the filter when the unfiltered day does have football.
          filterMessage={emptyFilterMessage}
        />
      )}

      {/* By time: one chronological list across leagues */}
      {!error && feed.layout === 'flat' && feed.total > 0 && (
        <div className="mt-2 px-2 pb-3">
          <div className="bg-bg-surface rounded-lg overflow-hidden">
            {feed.matches.map((m) => (
              <MatchCard key={m.id} match={m} timeZone={tz} showCompetition />
            ))}
          </div>
        </div>
      )}

      {/* Grouped: Following, then followed leagues, curated leagues, the rest */}
      {!error && feed.layout === 'grouped' && feed.total > 0 && (
        <div className="flex flex-col gap-2 mt-2 px-2 pb-3">
          {feed.following.length > 0 && (
            <FollowingSection
              matches={feed.following}
              timeZone={tz}
              collapsed={collapsed.values.has(FOLLOWING_SECTION)}
              onToggle={() => collapsed.toggle(FOLLOWING_SECTION)}
            />
          )}
          {feed.groups.map((group, i) => (
            <div
              key={group.code}
              className="animate-rise"
              // Small stagger so the feed assembles instead of appearing at
              // once. Capped so a 10-league day does not crawl in.
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <LeagueGroup
                group={group}
                code={group.code}
                timeZone={tz}
                collapsed={collapsed.values.has(group.code)}
                onToggle={() => collapsed.toggle(group.code)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FollowingSection({
  matches,
  timeZone,
  collapsed,
  onToggle,
}: {
  matches: Match[]
  timeZone: string | null
  collapsed: boolean
  onToggle: () => void
}) {
  const bodyId = useId()
  return (
    <section className="bg-bg-surface rounded-lg overflow-hidden" aria-label="Following">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green"
      >
        <Star size={18} className="text-accent-green" fill="currentColor" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-content-primary flex-1 text-left">Following</span>
        {collapsed && <span className="text-[11px] text-content-muted tabular-nums">{matches.length}</span>}
        <ChevronUp
          size={15}
          aria-hidden="true"
          className={`text-content-muted transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
        />
      </button>
      {!collapsed && (
        <div id={bodyId} className="border-t border-divider">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} timeZone={timeZone} showCompetition />
          ))}
        </div>
      )}
    </section>
  )
}
