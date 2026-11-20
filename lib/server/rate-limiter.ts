/**
 * Sliding-window rate limiter for upstream APIs.
 *
 * football-data.org's free plan allows 10 requests per minute
 * (https://docs.football-data.org/general/v4/policies.html). Firing more than
 * that returns 429s, which the old client swallowed silently — whole leagues
 * just vanished from the feed. Every upstream call now goes through here.
 *
 * Slots are handed out one at a time (serialised through `chain`) so that N
 * concurrent callers can never all pass the capacity check at once. The work
 * itself still runs concurrently once a slot is granted.
 */

export interface RateLimiterOptions {
  /** Max requests allowed inside `intervalMs`. */
  capacity: number
  /** Window length in milliseconds. */
  intervalMs: number
  /** Optional label used in debug output. */
  name?: string
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class RateLimiter {
  private readonly capacity: number
  private readonly intervalMs: number
  private readonly name: string

  /** Timestamps of requests inside the current window. */
  private hits: number[] = []
  /** Serialises slot allocation. */
  private chain: Promise<unknown> = Promise.resolve()
  /** Set when upstream returns 429 — no slot is granted before this time. */
  private pausedUntil = 0

  constructor({ capacity, intervalMs, name = 'limiter' }: RateLimiterOptions) {
    this.capacity = Math.max(1, capacity)
    this.intervalMs = intervalMs
    this.name = name
  }

  /** Runs `fn` as soon as a slot is free. */
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const slot = this.chain.then(() => this.waitForSlot())
    // Keep the chain alive even if a waiter rejects.
    this.chain = slot.catch(() => undefined)
    return slot.then(fn)
  }

  /**
   * Blocks all slots for `ms`. Called when upstream answers 429 so the whole
   * process backs off together instead of each caller retrying blindly.
   */
  pauseFor(ms: number): void {
    const until = Date.now() + ms
    if (until > this.pausedUntil) this.pausedUntil = until
  }

  /** Requests still available in the current window (for diagnostics). */
  get available(): number {
    const now = Date.now()
    const live = this.hits.filter((t) => now - t < this.intervalMs)
    return Math.max(0, this.capacity - live.length)
  }

  get isPaused(): boolean {
    return Date.now() < this.pausedUntil
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now()
      this.hits = this.hits.filter((t) => now - t < this.intervalMs)

      const pauseWait = this.pausedUntil - now
      if (pauseWait > 0) {
        await sleep(Math.min(pauseWait, this.intervalMs))
        continue
      }

      if (this.hits.length < this.capacity) {
        this.hits.push(now)
        return
      }

      // Window is full — wait until the oldest hit falls out of it.
      const oldest = this.hits[0]
      await sleep(Math.max(25, this.intervalMs - (now - oldest) + 25))
    }
  }

  toString(): string {
    return `RateLimiter(${this.name}: ${this.available}/${this.capacity} per ${this.intervalMs}ms)`
  }
}
