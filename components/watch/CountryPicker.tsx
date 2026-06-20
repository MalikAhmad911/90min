'use client'

import { COUNTRIES } from '@/lib/tv/broadcasters'
import type { Country } from '@/lib/tv/types'

interface CountryPickerProps {
  country: Country
  onChange: (code: string) => void
}

export function CountryPicker({ country, onChange }: CountryPickerProps) {
  return (
    <label className="flex items-center gap-1.5 text-[13px] text-content-secondary cursor-pointer">
      <span className="text-base leading-none">{country.flag}</span>
      <select
        aria-label="Select country"
        value={country.code}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-elevated text-content-primary text-[13px] font-medium rounded-full pl-2 pr-6 py-1 border border-divider focus:outline-none focus:ring-1 focus:ring-accent-green cursor-pointer appearance-none"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}
