'use client'

import { useEffect, useState } from 'react'
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/tv/broadcasters'
import type { Country } from '@/lib/tv/types'

const STORAGE_KEY = '90min:tv-country'

function guessFromLocale(): Country {
  if (typeof navigator === 'undefined') return DEFAULT_COUNTRY
  // e.g. "en-GB" -> "GB"
  const region = navigator.language?.split('-')[1]?.toUpperCase()
  return COUNTRIES.find((c) => c.code === region) ?? DEFAULT_COUNTRY
}

/**
 * localStorage-backed country selection for the Watch feature.
 * Defaults to the browser locale's region, then DEFAULT_COUNTRY.
 */
export function useCountry(): [Country, (code: string) => void] {
  const [country, setCountryState] = useState<Country>(DEFAULT_COUNTRY)

  // Resolve persisted/guessed value after mount (avoids hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const match = saved ? COUNTRIES.find((c) => c.code === saved) : undefined
    setCountryState(match ?? guessFromLocale())
  }, [])

  const setCountry = (code: string) => {
    const next = COUNTRIES.find((c) => c.code === code)
    if (!next) return
    setCountryState(next)
    localStorage.setItem(STORAGE_KEY, next.code)
  }

  return [country, setCountry]
}
