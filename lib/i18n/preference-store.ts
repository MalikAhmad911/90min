/**
 * A tiny localStorage-backed store shaped for `useSyncExternalStore`.
 *
 * Used for device-level display preferences (time format here, Lite mode in
 * hooks/useLiteMode.ts). Why not plain useState + useEffect per component:
 * the Settings page and, say, every MatchCard must agree the moment the user
 * flips a switch, and another open tab should follow too (`storage` event).
 *
 * Reads never throw: storage can be blocked (Safari private mode, strict
 * cookie settings), in which case the default applies and `write` reports
 * failure so the UI can say the choice was not saved.
 */

export interface PreferenceStore<T> {
  read: () => T
  /** Returns false when the value could not be persisted. */
  write: (value: T | null) => boolean
  subscribe: (onChange: () => void) => () => void
  /** Value used on the server and before hydration. */
  readonly serverValue: T
}

export function createPreferenceStore<T extends string | boolean>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string = String
): PreferenceStore<T> {
  const listeners = new Set<() => void>()
  const serverValue = parse(null)

  const notify = () => listeners.forEach((listener) => listener())

  return {
    serverValue,

    read() {
      try {
        return parse(window.localStorage.getItem(key))
      } catch {
        return serverValue
      }
    },

    write(value) {
      try {
        if (value === null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, serialize(value))
        return true
      } catch {
        return false
      } finally {
        notify()
      }
    },

    subscribe(onChange) {
      listeners.add(onChange)
      // Another tab changed it (key === null means storage was cleared).
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) onChange()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(onChange)
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}
