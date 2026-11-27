// @vitest-environment node
import {
  consume,
  reset,
  decide,
  clientIp,
  hashKey,
  tooManyRequests,
  PRUNE_AFTER_MS,
  type HitStore,
} from '@/lib/server/rate-limit'

/**
 * In-memory HitStore with the same visibility rules as the database one: a
 * recorded hit is visible to every later `window` call. Each call yields to
 * the event loop first, so concurrent consumers really do interleave.
 */
function memoryStore(clock: () => number) {
  const hits: { bucket: string; key: string; at: number }[] = []
  const tick = () => new Promise<void>((r) => setTimeout(r, Math.random() * 3))
  let prunes = 0

  const store: HitStore = {
    async record(bucket, key) {
      await tick()
      hits.push({ bucket, key, at: clock() })
    },
    async window(bucket, key, windowMs, limit) {
      await tick()
      const now = clock()
      const live = hits
        .filter((h) => h.bucket === bucket && h.key === key && h.at > now - windowMs)
        .map((h) => h.at)
        .sort((a, b) => b - a)
      return {
        count: Math.min(live.length, limit + 1),
        pivotMs: live[limit - 1] ?? null,
        nowMs: now,
      }
    },
    async clear(bucket, key) {
      for (let i = hits.length - 1; i >= 0; i--) {
        if (hits[i].bucket === bucket && hits[i].key === key) hits.splice(i, 1)
      }
    },
    async prune(olderThanMs) {
      prunes++
      const cutoff = clock() - olderThanMs
      for (let i = hits.length - 1; i >= 0; i--) if (hits[i].at < cutoff) hits.splice(i, 1)
    },
  }
  return { store, hits, prunes: () => prunes }
}

const noPrune = () => 1

describe('decide (window maths)', () => {
  const opts = { limit: 3, windowMs: 60_000 }

  it('allows up to the limit and reports what is left', () => {
    expect(decide({ count: 1, pivotMs: null, nowMs: 0 }, opts)).toEqual({ allowed: true, remaining: 2, retryAfterSec: 0 })
    expect(decide({ count: 3, pivotMs: 0, nowMs: 0 }, opts)).toEqual({ allowed: true, remaining: 0, retryAfterSec: 0 })
  })

  it('denies past the limit and waits until the limit-th newest hit expires', () => {
    // Hits at t=10s, 20s, 30s, 40s; now=40s. The 3rd newest (20s) must leave
    // the window before only 2 remain: 20s + 60s - 40s = 40s.
    expect(decide({ count: 4, pivotMs: 20_000, nowMs: 40_000 }, opts)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSec: 40,
    })
  })

  it('rounds the wait up and never says 0 when denied', () => {
    expect(decide({ count: 4, pivotMs: 0, nowMs: 59_999 }, opts).retryAfterSec).toBe(1)
    expect(decide({ count: 4, pivotMs: 0, nowMs: 58_500 }, opts).retryAfterSec).toBe(2)
  })
})

describe('consume', () => {
  it('allows `limit` hits, then denies with a Retry-After', async () => {
    let now = 1_000_000
    const { store } = memoryStore(() => now)
    const opts = { limit: 3, windowMs: 60_000 }

    const results = []
    for (let i = 0; i < 4; i++) {
      results.push(await consume('test', 'k', opts, { store, random: noPrune }))
      now += 1_000
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0])
    // Hits at +0s,+1s,+2s,+3s; the 3rd newest (+1s) expires at +61s; now is +3s.
    expect(results[3].retryAfterSec).toBe(58)
  })

  it('slides: old hits leave the window', async () => {
    let now = 0
    const { store } = memoryStore(() => now)
    const opts = { limit: 2, windowMs: 10_000 }
    await consume('test', 'k', opts, { store, random: noPrune })
    await consume('test', 'k', opts, { store, random: noPrune })
    expect((await consume('test', 'k', opts, { store, random: noPrune })).allowed).toBe(false)

    now = 10_001
    // The three hits at t=0 have all left the window.
    expect((await consume('test', 'k', opts, { store, random: noPrune })).allowed).toBe(true)
  })

  it('keeps buckets and keys apart', async () => {
    const { store } = memoryStore(() => 0)
    const opts = { limit: 1, windowMs: 10_000 }
    expect((await consume('a', 'k', opts, { store, random: noPrune })).allowed).toBe(true)
    expect((await consume('b', 'k', opts, { store, random: noPrune })).allowed).toBe(true)
    expect((await consume('a', 'other', opts, { store, random: noPrune })).allowed).toBe(true)
    expect((await consume('a', 'k', opts, { store, random: noPrune })).allowed).toBe(false)
  })

  it('never lets more than `limit` concurrent requests through', async () => {
    for (let round = 0; round < 20; round++) {
      const { store } = memoryStore(() => 0)
      const results = await Promise.all(
        Array.from({ length: 25 }, () =>
          consume('burst', 'k', { limit: 5, windowMs: 60_000 }, { store, random: noPrune })
        )
      )
      // Only the upper bound is guaranteed: if all 25 inserts land before any
      // count runs, every request sees 25 and all are (conservatively) denied.
      expect(results.filter((r) => r.allowed).length).toBeLessThanOrEqual(5)
    }
  })

  it('stores a hash of the key, never the raw value', async () => {
    const { store, hits } = memoryStore(() => 0)
    await consume('test', '203.0.113.7', { limit: 5, windowMs: 1_000 }, { store, random: noPrune })
    expect(hits[0].key).toBe(hashKey('203.0.113.7'))
    expect(hits[0].key).not.toContain('203.0.113.7')
  })

  it('reset clears one key only', async () => {
    const { store } = memoryStore(() => 0)
    const opts = { limit: 1, windowMs: 10_000 }
    await consume('test', 'a', opts, { store, random: noPrune })
    await consume('test', 'b', opts, { store, random: noPrune })
    await reset('test', 'a', { store })
    expect((await consume('test', 'a', opts, { store, random: noPrune })).allowed).toBe(true)
    expect((await consume('test', 'b', opts, { store, random: noPrune })).allowed).toBe(false)
  })

  it('prunes only when the dice say so, and a failed prune does not fail the call', async () => {
    const mem = memoryStore(() => 0)
    await consume('test', 'k', { limit: 5, windowMs: 1_000 }, { store: mem.store, random: () => 0.5 })
    expect(mem.prunes()).toBe(0)
    await consume('test', 'k', { limit: 5, windowMs: 1_000 }, { store: mem.store, random: () => 0 })
    expect(mem.prunes()).toBe(1)

    const failing: HitStore = { ...mem.store, prune: () => Promise.reject(new Error('db down')) }
    await expect(
      consume('test', 'k', { limit: 5, windowMs: 1_000 }, { store: failing, random: () => 0 })
    ).resolves.toMatchObject({ allowed: true })
  })

  it('rejects windows longer than the prune horizon and bad options', async () => {
    const { store } = memoryStore(() => 0)
    await expect(consume('test', 'k', { limit: 1, windowMs: PRUNE_AFTER_MS + 1 }, { store })).rejects.toThrow()
    await expect(consume('test', 'k', { limit: 0, windowMs: 1_000 }, { store })).rejects.toThrow()
    await expect(consume('Bad Bucket', 'k', { limit: 1, windowMs: 1_000 }, { store })).rejects.toThrow()
  })
})

describe('clientIp', () => {
  it('prefers the Netlify header', () => {
    const h = new Headers({ 'x-nf-client-connection-ip': '198.51.100.1', 'x-forwarded-for': '203.0.113.9' })
    expect(clientIp(h)).toBe('198.51.100.1')
  })

  it('falls back to the first x-forwarded-for entry', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1' }))).toBe('203.0.113.9')
  })

  it('falls back to a constant when nothing is known', () => {
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

describe('tooManyRequests', () => {
  it('is a 429 with Retry-After', async () => {
    const res = tooManyRequests({ allowed: false, remaining: 0, retryAfterSec: 42 }, 'Slow down')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(await res.json()).toEqual({ error: 'Slow down' })
  })
})
