'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * A set of strings remembered in localStorage (collapsed leagues, hidden
 * competitions). Starts empty on the server and first render, then loads,
 * so the server HTML and the first client render agree.
 *
 * Every storage access is guarded: private mode and blocked site data throw.
 */
export function usePersistentSet(storageKey: string) {
  const [values, setValues] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        setValues(new Set(parsed.filter((v): v is string => typeof v === 'string')))
      }
    } catch {
      // unreadable - keep the empty default
    }
  }, [storageKey])

  const persist = useCallback(
    (next: Set<string>) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        // not persisted; state still applies for this visit
      }
      return next
    },
    [storageKey]
  )

  const toggle = useCallback(
    (value: string) =>
      setValues((prev) => {
        const next = new Set(prev)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        return persist(next)
      }),
    [persist]
  )

  const replace = useCallback(
    (next: Iterable<string>) => setValues(persist(new Set(next))),
    [persist]
  )

  return { values, toggle, replace }
}
