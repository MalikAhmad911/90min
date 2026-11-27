/**
 * Time-zone helpers shared by the home feed (PRD MAT-1: "today in the user's
 * time zone"), quiet hours (NT-4) and the settings page.
 *
 * Everything is built on Intl, so it is DST-correct without a date library.
 * The bug this replaces: the feed used `toISOString()`, i.e. the UTC date, so
 * in Karachi (UTC+5) a 03:30 kickoff on 20 Nov was listed under 19 Nov.
 */

export const TIMEZONE_STORAGE_KEY = '90min:tz'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** True for a time zone the runtime knows, e.g. 'Asia/Karachi' or 'UTC'. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The runtime's own zone, or UTC if it cannot be determined. */
export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(tz) ? tz : 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The zone the user chose in settings, else the browser's. Browser-only. */
export function getPreferredTimeZone(): string {
  try {
    const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY)
    if (isValidTimeZone(stored)) return stored
  } catch {
    // storage blocked - fall back to detection
  }
  return detectTimeZone()
}

/** Fired on `window` when this tab changes the zone (`storage` covers other tabs). */
const TIMEZONE_CHANGE_EVENT = '90min:tz-change'

/** Saves an explicit choice; null clears it so detection takes over again. */
export function setPreferredTimeZone(tz: string | null): void {
  try {
    if (tz === null) window.localStorage.removeItem(TIMEZONE_STORAGE_KEY)
    else if (isValidTimeZone(tz)) window.localStorage.setItem(TIMEZONE_STORAGE_KEY, tz)
  } catch {
    // not persisted
  }
  try {
    window.dispatchEvent(new Event(TIMEZONE_CHANGE_EVENT))
  } catch {
    // no window (server) - nothing is listening anyway
  }
}

/**
 * Calls `onChange` whenever the preferred zone may have changed, in this tab
 * or another. Shaped for `useSyncExternalStore` with `getPreferredTimeZone`.
 */
export function subscribePreferredTimeZone(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === TIMEZONE_STORAGE_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(TIMEZONE_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(TIMEZONE_CHANGE_EVENT, onChange)
  }
}

/** The calendar date ('YYYY-MM-DD') that instant `at` falls on in `tz`. */
export function localDateString(at: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Offset of `tz` from UTC at instant `at`, in ms (positive east of UTC). */
function offsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)

  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  // Drop sub-second precision so the subtraction is exact.
  return wallClockAsUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The UTC instant of local midnight starting `ymd` in `tz`. */
function localMidnightUtc(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const first = offsetMs(new Date(guess), tz)
  let ts = guess - first
  // Re-check at the candidate instant: it differs when a DST change falls
  // between UTC midnight and local midnight.
  const second = offsetMs(new Date(ts), tz)
  if (second !== first) ts = guess - second
  return new Date(ts)
}

/** 'YYYY-MM-DD' shifted by whole days. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The UTC interval [start, end) covering local calendar day `ymd` in `tz`.
 * A local day usually spans two UTC dates, which is why the feed cannot
 * simply query one `match_date`.
 */
export function localDayRangeUtc(ymd: string, tz: string): { start: Date; end: Date } {
  if (!YMD.test(ymd)) throw new Error(`Invalid date: ${ymd}`)
  if (!isValidTimeZone(tz)) throw new Error(`Invalid time zone: ${tz}`)
  return { start: localMidnightUtc(ymd, tz), end: localMidnightUtc(addDays(ymd, 1), tz) }
}
