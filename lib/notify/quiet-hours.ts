import { isValidTimeZone } from '@/lib/timezone'

/**
 * Quiet hours (PRD NT-4), evaluated in the subscriber's own time zone.
 *
 * Stored as whole hours: start is inclusive, end exclusive. A window such as
 * 22 -> 7 wraps past midnight, which is the common case ("no pushes while I
 * sleep"), so it cannot be a plain `start <= h < end` test.
 */

/** The hour (0-23) that instant `at` falls in, in `tz`. */
export function localHour(at: Date, tz: string): number {
  const zone = isValidTimeZone(tz) ? tz : 'UTC'
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(at)
    .find((p) => p.type === 'hour')?.value
  return Number(hour ?? 0) % 24
}

/** True when `hour` lies inside [start, end), wrapping past midnight when start > end. */
export function hourInWindow(hour: number, start: number, end: number): boolean {
  // An empty window. Treating 7 -> 7 as "all day" would silently mute
  // everything after a careless edit, so it means "never quiet" instead.
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end
}

/**
 * Whether a push to this subscriber should be held back at instant `at`.
 * Either bound missing means quiet hours are off. An unknown zone falls back
 * to UTC rather than throwing, so one bad row cannot stop a dispatch run.
 */
export function isQuietTime(
  at: Date,
  tz: string,
  start: number | null | undefined,
  end: number | null | undefined
): boolean {
  if (start == null || end == null) return false
  return hourInWindow(localHour(at, tz), start, end)
}
