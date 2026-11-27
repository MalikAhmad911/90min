import { hourInWindow, isQuietTime, localHour } from '@/lib/notify/quiet-hours'

describe('hourInWindow', () => {
  it('handles a same-day window [start, end)', () => {
    expect(hourInWindow(13, 13, 15)).toBe(true)
    expect(hourInWindow(14, 13, 15)).toBe(true)
    expect(hourInWindow(15, 13, 15)).toBe(false)
    expect(hourInWindow(12, 13, 15)).toBe(false)
  })

  it('wraps past midnight for 22 -> 7', () => {
    for (const h of [22, 23, 0, 3, 6]) expect(hourInWindow(h, 22, 7)).toBe(true)
    for (const h of [7, 8, 12, 21]) expect(hourInWindow(h, 22, 7)).toBe(false)
  })

  it('treats start == end as never quiet, not always', () => {
    for (let h = 0; h < 24; h++) expect(hourInWindow(h, 7, 7)).toBe(false)
  })
})

describe('isQuietTime in the subscriber\'s zone', () => {
  // 21:30 UTC = 02:30 in Karachi (UTC+5) = 16:30 in New York (UTC-5 in November).
  const at = new Date('2026-11-28T21:30:00Z')

  it('reads the local hour in the given zone', () => {
    expect(localHour(at, 'UTC')).toBe(21)
    expect(localHour(at, 'Asia/Karachi')).toBe(2)
    expect(localHour(at, 'America/New_York')).toBe(16)
  })

  it('the same instant is quiet in Karachi and not in New York (22 -> 7)', () => {
    expect(isQuietTime(at, 'Asia/Karachi', 22, 7)).toBe(true)
    expect(isQuietTime(at, 'America/New_York', 22, 7)).toBe(false)
  })

  it('follows daylight saving: 06:30 UTC is 02:30 in New York in July, 01:30 in November', () => {
    expect(localHour(new Date('2026-07-01T06:30:00Z'), 'America/New_York')).toBe(2)
    expect(localHour(new Date('2026-11-28T06:30:00Z'), 'America/New_York')).toBe(1)
  })

  it('is off when either bound is missing', () => {
    expect(isQuietTime(at, 'UTC', null, null)).toBe(false)
    expect(isQuietTime(at, 'UTC', 20, null)).toBe(false)
  })

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    expect(isQuietTime(at, 'Mars/Olympus', 21, 22)).toBe(true)
  })
})
