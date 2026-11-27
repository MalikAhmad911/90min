import {
  isValidTimeZone,
  localDateString,
  localDayRangeUtc,
  addDays,
} from '@/lib/timezone'
import { isDeviceId } from '@/lib/device'

describe('isValidTimeZone', () => {
  it('accepts real IANA zones', () => {
    expect(isValidTimeZone('Asia/Karachi')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
  })

  it('rejects junk and non-strings', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(42)).toBe(false)
    expect(isValidTimeZone('x'.repeat(65))).toBe(false)
  })
})

describe('localDateString', () => {
  // The exact case that was wrong in production: a 22:30 UTC kickoff on
  // 19 Nov is 03:30 on 20 Nov in Karachi.
  it('puts a late-UTC kickoff on the next local day east of UTC', () => {
    const kickoff = new Date('2026-11-19T22:30:00Z')
    expect(localDateString(kickoff, 'UTC')).toBe('2026-11-19')
    expect(localDateString(kickoff, 'Asia/Karachi')).toBe('2026-11-20')
  })

  it('puts an early-UTC kickoff on the previous local day west of UTC', () => {
    expect(localDateString(new Date('2026-11-20T02:00:00Z'), 'America/New_York')).toBe(
      '2026-11-19'
    )
  })
})

describe('localDayRangeUtc', () => {
  it('spans the right UTC instants for a fixed-offset zone', () => {
    const { start, end } = localDayRangeUtc('2026-11-20', 'Asia/Karachi')
    expect(start.toISOString()).toBe('2026-11-19T19:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-20T19:00:00.000Z')
  })

  it('is exactly one UTC day in UTC', () => {
    const { start, end } = localDayRangeUtc('2026-11-20', 'UTC')
    expect(start.toISOString()).toBe('2026-11-20T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-21T00:00:00.000Z')
  })

  it('is 23 hours long on the day the clocks go forward', () => {
    // Europe/London springs forward on 29 Mar 2026.
    const { start, end } = localDayRangeUtc('2026-03-29', 'Europe/London')
    expect(start.toISOString()).toBe('2026-03-29T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-03-29T23:00:00.000Z')
  })

  it('is 25 hours long on the day the clocks go back', () => {
    // Europe/London falls back on 25 Oct 2026.
    const { start, end } = localDayRangeUtc('2026-10-25', 'Europe/London')
    expect(start.toISOString()).toBe('2026-10-24T23:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })

  it('rejects bad input instead of guessing', () => {
    expect(() => localDayRangeUtc('20-11-2026', 'UTC')).toThrow()
    expect(() => localDayRangeUtc('2026-11-20', 'Nowhere/Zone')).toThrow()
  })
})

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('isDeviceId', () => {
  it('accepts the shape getDeviceId produces', () => {
    expect(isDeviceId('a'.repeat(32))).toBe(true)
    expect(isDeviceId('0123456789abcdef0123456789abcdef')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isDeviceId('short')).toBe(false)
    expect(isDeviceId('x'.repeat(65))).toBe(false)
    expect(isDeviceId("abc'; drop table follows;--x")).toBe(false)
    expect(isDeviceId(null)).toBe(false)
  })
})
