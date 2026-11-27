import { UTC_KICKOFF_DISPLAY, formatKickoffClock, formatKickoffDay } from '@/lib/kickoff-time'
import { litePollInterval } from '@/hooks/useLiteMode'

// 20:45 UTC on Friday 20 November 2026 = 01:45 on Saturday 21 November in Karachi (UTC+5).
const KICKOFF = '2026-11-20T20:45:00Z'

describe('formatKickoffClock', () => {
  it('renders UTC on a 24-hour clock before hydration', () => {
    expect(formatKickoffClock(KICKOFF, UTC_KICKOFF_DISPLAY)).toBe('20:45')
  })

  it('uses the chosen time zone', () => {
    expect(formatKickoffClock(KICKOFF, { timeZone: 'Asia/Karachi', timeFormat: '24h' })).toBe('01:45')
    expect(formatKickoffClock(KICKOFF, { timeZone: 'America/New_York', timeFormat: '24h' })).toBe('15:45')
  })

  it('uses a 12-hour clock when chosen', () => {
    expect(formatKickoffClock(KICKOFF, { timeZone: 'UTC', timeFormat: '12h' }).toLowerCase()).toMatch(/^08:45\s?pm$/)
    expect(formatKickoffClock(KICKOFF, { timeZone: 'Asia/Karachi', timeFormat: '12h' }).toLowerCase()).toMatch(
      /^01:45\s?am$/
    )
  })

  it('never shows 24:xx past midnight on a 24-hour clock', () => {
    expect(formatKickoffClock('2026-11-20T00:05:00Z', UTC_KICKOFF_DISPLAY)).toBe('00:05')
  })

  it('falls back to UTC for a zone the runtime rejects, and to "" for a bad date', () => {
    expect(formatKickoffClock(KICKOFF, { timeZone: 'Mars/Olympus', timeFormat: '24h' })).toBe('20:45')
    expect(formatKickoffClock('not a date', UTC_KICKOFF_DISPLAY)).toBe('')
  })
})

describe('formatKickoffDay', () => {
  it('puts a late kick-off on the next day east of UTC', () => {
    const options = { weekday: 'short', day: 'numeric', month: 'short' } as const
    expect(formatKickoffDay(KICKOFF, UTC_KICKOFF_DISPLAY, options)).toBe('Fri 20 Nov')
    expect(formatKickoffDay(KICKOFF, { timeZone: 'Asia/Karachi', timeFormat: '24h' }, options)).toBe('Sat 21 Nov')
  })

  it('returns "" for a bad date', () => {
    expect(formatKickoffDay('nope', UTC_KICKOFF_DISPLAY, { day: 'numeric' })).toBe('')
  })
})

describe('litePollInterval', () => {
  it('doubles polling intervals in Lite mode and leaves "no polling" alone', () => {
    expect(litePollInterval(30_000, false)).toBe(30_000)
    expect(litePollInterval(30_000, true)).toBe(60_000)
    expect(litePollInterval(0, true)).toBe(0)
  })
})
