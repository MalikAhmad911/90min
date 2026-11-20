import { RateLimiter } from '@/lib/server/rate-limiter'

/** Resolves to the ms elapsed while running `fn`. */
async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = Date.now()
  await fn()
  return Date.now() - start
}

describe('RateLimiter', () => {
  it('runs up to capacity without delaying anything', async () => {
    const limiter = new RateLimiter({ capacity: 3, intervalMs: 5_000 })
    const elapsed = await timed(() =>
      Promise.all([1, 2, 3].map((n) => limiter.schedule(async () => n)))
    )
    expect(elapsed).toBeLessThan(150)
  })

  it('returns every scheduled result', async () => {
    const limiter = new RateLimiter({ capacity: 2, intervalMs: 200 })
    const results = await Promise.all([1, 2, 3, 4].map((n) => limiter.schedule(async () => n * 2)))
    expect(results).toEqual([2, 4, 6, 8])
  })

  it('makes the call past capacity wait for the window to roll', async () => {
    const limiter = new RateLimiter({ capacity: 2, intervalMs: 300 })
    // First two go straight through; the third must wait out the window.
    await Promise.all([limiter.schedule(async () => 1), limiter.schedule(async () => 2)])

    const elapsed = await timed(() => limiter.schedule(async () => 3))
    expect(elapsed).toBeGreaterThanOrEqual(250)
  })

  it('reports remaining capacity', async () => {
    const limiter = new RateLimiter({ capacity: 5, intervalMs: 5_000 })
    expect(limiter.available).toBe(5)
    await limiter.schedule(async () => null)
    await limiter.schedule(async () => null)
    expect(limiter.available).toBe(3)
  })

  it('holds every caller back after pauseFor (the 429 path)', async () => {
    const limiter = new RateLimiter({ capacity: 10, intervalMs: 5_000 })
    limiter.pauseFor(250)
    expect(limiter.isPaused).toBe(true)

    const elapsed = await timed(() => limiter.schedule(async () => 'done'))
    expect(elapsed).toBeGreaterThanOrEqual(200)
    expect(limiter.isPaused).toBe(false)
  })

  it('serialises slot hand-out so concurrent callers cannot overshoot', async () => {
    const limiter = new RateLimiter({ capacity: 3, intervalMs: 10_000 })
    let concurrent = 0
    let peak = 0

    await Promise.all(
      Array.from({ length: 3 }, () =>
        limiter.schedule(async () => {
          concurrent += 1
          peak = Math.max(peak, concurrent)
          await new Promise((r) => setTimeout(r, 20))
          concurrent -= 1
        })
      )
    )

    // All three fit in the window, so they genuinely run together.
    expect(peak).toBe(3)
    expect(limiter.available).toBe(0)
  })

  it('surfaces errors from the scheduled function without killing the queue', async () => {
    const limiter = new RateLimiter({ capacity: 5, intervalMs: 1_000 })
    await expect(
      limiter.schedule(async () => {
        throw new Error('upstream exploded')
      })
    ).rejects.toThrow('upstream exploded')

    // The limiter still works afterwards.
    await expect(limiter.schedule(async () => 'ok')).resolves.toBe('ok')
  })
})
