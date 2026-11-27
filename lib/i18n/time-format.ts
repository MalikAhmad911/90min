/**
 * The 12h/24h preference. Per device (localStorage) like the time zone in
 * lib/timezone.ts, because it is a display habit rather than an account
 * setting, and it must work for visitors who never sign in.
 */

import type { TimeFormat } from './format'
import { createPreferenceStore } from './preference-store'

export const TIME_FORMAT_STORAGE_KEY = '90min:time-format'

/** Football is scheduled on a 24-hour clock; see formatTime in format.ts. */
export const DEFAULT_TIME_FORMAT: TimeFormat = '24h'

export function isTimeFormat(value: unknown): value is TimeFormat {
  return value === '24h' || value === '12h'
}

export const timeFormatStore = createPreferenceStore<TimeFormat>(TIME_FORMAT_STORAGE_KEY, (raw) =>
  isTimeFormat(raw) ? raw : DEFAULT_TIME_FORMAT
)

export function getPreferredTimeFormat(): TimeFormat {
  return timeFormatStore.read()
}

/** Returns false if the browser refused to store it. */
export function setPreferredTimeFormat(format: TimeFormat): boolean {
  if (!isTimeFormat(format)) return false
  return timeFormatStore.write(format)
}
