import { cached, invalidate, clearMemoryCache } from '@/lib/server/cache'

/** Unique per test so the on-disk layer from a previous run cannot leak in. */
let counter = 0
const freshKey = () => `test:${Date.now()}:${counter++}:${Math.random().toString(36).slice(2)}`

const NEVER_STALE = { freshMs: 60_000, staleMs: 600_000 }
const ALWAYS_STALE = { freshMs: 0, staleMs: 600_000 }
const ALWAYS_EXPIRED = { freshMs: 0, staleMs: 0 }

const tick = () => new Promise((r) => setTimeout(r, 30))

describe('cached', () => {
  beforeEach(() => clearMemoryCache())

  it('calls the loader on a miss and returns its value', async () => {
    const key = freshKey()
    let calls = 0
    const res = await cached(key, NEVER_STALE, async () => {
      calls += 1
      return 'first'
    })

    expect(res.value).toBe('first')
    expect(res.stale).toBe(false)
    expect(calls).toBe(1)
    await invalidate(key)
  })

  it('serves a fresh value without touching the loader again', async () => {
    const key = freshKey()
    let calls = 0
    const loader = async () => {
      calls += 1
      return calls
    }

    await cached(key, NEVER_STALE, loader)
    const second = await cached(key, NEVER_STALE, loader)

    expect(second.value).toBe(1)
    expect(second.stale).toBe(false)
    expect(calls).toBe(1)
    await invalidate(key)
  })

  it('serves a stale value immediately and refreshes in the background', async () => {
    const key = freshKey()
    let calls = 0
    const loader = async () => {
      calls += 1
      return `load-${calls}`
    }

    await cached(key, ALWAYS_STALE, loader)
    const second = await cached(key, ALWAYS_STALE, loader)

    // Returned the old value right away...
    expect(second.value).toBe('load-1')
    expect(second.stale).toBe(true)

    // ...and refreshed behind it.
    await tick()
    const third = await cached(key, NEVER_STALE, loader)
    expect(third.value).toBe('load-2')
    await invalidate(key)
  })

  it('awaits the loader once the value is past staleMs', async () => {
    const key = freshKey()
    let calls = 0
    const loader = async () => {
      calls += 1
      return calls
    }

    await cached(key, ALWAYS_EXPIRED, loader)
    const second = await cached(key, ALWAYS_EXPIRED, loader)

    expect(second.value).toBe(2)
    expect(second.stale).toBe(false)
    expect(calls).toBe(2)
    await invalidate(key)
  })

  it('falls back to a stale value when the loader fails (stale-if-error)', async () => {
    const key = freshKey()
    await cached(key, ALWAYS_EXPIRED, async () => 'good value')

    const res = await cached(key, ALWAYS_EXPIRED, async () => {
      throw new Error('upstream 429')
    })

    expect(res.value).toBe('good value')
    expect(res.stale).toBe(true)
    await invalidate(key)
  })

  it('rethrows when the loader fails and nothing is cached', async () => {
    const key = freshKey()
    await expect(
      cached(key, NEVER_STALE, async () => {
        throw new Error('upstream 429')
      })
    ).rejects.toThrow('upstream 429')
  })

  it('collapses concurrent misses into a single loader call', async () => {
    const key = freshKey()
    let calls = 0
    const loader = async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 25))
      return 'shared'
    }

    const results = await Promise.all([
      cached(key, NEVER_STALE, loader),
      cached(key, NEVER_STALE, loader),
      cached(key, NEVER_STALE, loader),
    ])

    expect(results.map((r) => r.value)).toEqual(['shared', 'shared', 'shared'])
    expect(calls).toBe(1)
    await invalidate(key)
  })

  it('accepts a policy derived from the cached value', async () => {
    const key = freshKey()
    let calls = 0
    const loader = async () => {
      calls += 1
      return { status: calls === 1 ? 'IN_PLAY' : 'FINISHED' }
    }

    // Live -> always refetch; finished -> never refetch.
    const policy = (current: { status: string } | undefined) =>
      current?.status === 'FINISHED'
        ? { freshMs: 60_000, staleMs: 600_000 }
        : { freshMs: 0, staleMs: 0 }

    await cached(key, policy, loader)
    await cached(key, policy, loader)
    expect(calls).toBe(2)

    // Now it is FINISHED, so the policy keeps it fresh.
    const third = await cached(key, policy, loader)
    expect(third.value.status).toBe('FINISHED')
    expect(calls).toBe(2)
    await invalidate(key)
  })

  it('invalidate forces the next read to reload', async () => {
    const key = freshKey()
    let calls = 0
    const loader = async () => {
      calls += 1
      return calls
    }

    await cached(key, NEVER_STALE, loader)
    await invalidate(key)
    const after = await cached(key, NEVER_STALE, loader)

    expect(after.value).toBe(2)
    await invalidate(key)
  })
})
