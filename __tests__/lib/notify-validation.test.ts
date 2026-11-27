import { prefsPatchSchema, subscribeSchema, unsubscribeSchema } from '@/lib/notify/validation'

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123:XYZ',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
  deviceId: '0123456789abcdef0123456789abcdef',
  timezone: 'Asia/Karachi',
  locale: 'en',
}

describe('subscribeSchema', () => {
  it('accepts a browser PushSubscription plus device fields', () => {
    expect(subscribeSchema.safeParse(valid).success).toBe(true)
    expect(subscribeSchema.safeParse({ ...valid, expirationTime: null, locale: 'ur' }).success).toBe(true)
    expect(subscribeSchema.safeParse({ ...valid, quietStartHour: 22, quietEndHour: 7 }).success).toBe(true)
    expect(subscribeSchema.safeParse({ ...valid, quietStartHour: null, quietEndHour: null }).success).toBe(true)
  })

  it('rejects an http (or non-URL) endpoint', () => {
    expect(subscribeSchema.safeParse({ ...valid, endpoint: 'http://fcm.googleapis.com/x' }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, endpoint: 'javascript:alert(1)' }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, endpoint: 'not a url' }).success).toBe(false)
  })

  it('rejects bad device ids', () => {
    for (const deviceId of ['short', 'has spaces in it!!!!!', 'x'.repeat(65), 42, undefined]) {
      expect(subscribeSchema.safeParse({ ...valid, deviceId }).success).toBe(false)
    }
  })

  it('rejects unknown time zones and locales', () => {
    expect(subscribeSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, timezone: '' }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, locale: 'fr' }).success).toBe(false)
  })

  it('rejects out-of-range or half-set quiet hours', () => {
    expect(subscribeSchema.safeParse({ ...valid, quietStartHour: 24, quietEndHour: 7 }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, quietStartHour: -1, quietEndHour: 7 }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, quietStartHour: 1.5, quietEndHour: 7 }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, quietStartHour: 22 }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, quietStartHour: 22, quietEndHour: null }).success).toBe(false)
  })

  it('rejects malformed keys and unexpected fields', () => {
    expect(subscribeSchema.safeParse({ ...valid, keys: { ...valid.keys, auth: 'short' } }).success).toBe(false)
    expect(
      subscribeSchema.safeParse({ ...valid, keys: { ...valid.keys, p256dh: '<script>'.repeat(10) } }).success
    ).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, failureCount: 0 }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...valid, id: 'someone-elses' }).success).toBe(false)
  })
})

describe('unsubscribeSchema', () => {
  it('needs an https endpoint and nothing else', () => {
    expect(unsubscribeSchema.safeParse({ endpoint: valid.endpoint }).success).toBe(true)
    expect(unsubscribeSchema.safeParse({ endpoint: 'http://x.y' }).success).toBe(false)
    expect(unsubscribeSchema.safeParse({ endpoint: valid.endpoint, deviceId: 'x' }).success).toBe(false)
  })
})

describe('prefsPatchSchema', () => {
  const follow = { entityType: 'team', entityKey: '57' }

  it('accepts allow-listed toggles', () => {
    expect(prefsPatchSchema.safeParse({ follow: { ...follow, notify: { goals: false } } }).success).toBe(true)
    expect(
      prefsPatchSchema.safeParse({ follow: { ...follow, notify: { lineups: true, halfTime: true } } }).success
    ).toBe(true)
  })

  it('rejects unknown keys, non-booleans and empty patches', () => {
    expect(prefsPatchSchema.safeParse({ follow: { ...follow, notify: { admin: true } } }).success).toBe(false)
    expect(prefsPatchSchema.safeParse({ follow: { ...follow, notify: { goals: 'yes' } } }).success).toBe(false)
    expect(prefsPatchSchema.safeParse({ follow: { ...follow, notify: {} } }).success).toBe(false)
    expect(
      prefsPatchSchema.safeParse({ follow: { ...follow, entityType: 'user', notify: { goals: true } } }).success
    ).toBe(false)
    expect(
      prefsPatchSchema.safeParse({ follow: { ...follow, entityKey: "57' OR 1=1", notify: { goals: true } } })
        .success
    ).toBe(false)
  })

  it('never lets a body choose the device', () => {
    expect(
      prefsPatchSchema.safeParse({ follow: { ...follow, deviceId: 'abcdefabcdefabcdef', notify: { goals: true } } })
        .success
    ).toBe(false)
  })

  it('accepts quiet hours, including off', () => {
    expect(prefsPatchSchema.safeParse({ quietHours: { quietStartHour: 22, quietEndHour: 7 } }).success).toBe(true)
    expect(prefsPatchSchema.safeParse({ quietHours: { quietStartHour: null, quietEndHour: null } }).success).toBe(
      true
    )
    expect(
      prefsPatchSchema.safeParse({ quietHours: { quietStartHour: 22, quietEndHour: 7, timezone: 'Nowhere/X' } })
        .success
    ).toBe(false)
  })
})
