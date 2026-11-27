/**
 * An anonymous, per-browser identifier.
 *
 * Follows and push subscriptions belong to a device rather than an account
 * (PRD section 17 leaves accounts optional). The id is 128 random bits from
 * the platform CSPRNG, stored in localStorage, and sent to the API in the
 * `x-device-id` header. It identifies a browser, not a person.
 *
 * It is also a bearer secret: whoever holds it can manage that device's
 * follows. That is acceptable for preferences that carry no personal data,
 * and it is why the server only ever accepts the exact shape below.
 */

export const DEVICE_ID_STORAGE_KEY = '90min:device-id'
export const DEVICE_ID_HEADER = 'x-device-id'

const SHAPE = /^[A-Za-z0-9_-]{16,64}$/

/** Server-side guard: the only strings the API will accept as a device id. */
export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && SHAPE.test(value)
}

/** Kept in memory when storage is unavailable (private mode, blocked site data). */
let inMemory: string | null = null

function generate(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * This browser's device id, created on first use. Browser-only.
 *
 * Falls back to an in-memory id when localStorage throws, so the app keeps
 * working for the session even where nothing can be persisted.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    throw new Error('getDeviceId() is browser-only')
  }

  try {
    const stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (isDeviceId(stored)) return stored
  } catch {
    // storage blocked - fall through to the in-memory id
  }

  if (inMemory) return inMemory

  const id = generate()
  inMemory = id
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id)
  } catch {
    // not persisted; the in-memory id still serves this session
  }
  return id
}
