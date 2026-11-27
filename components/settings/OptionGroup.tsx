'use client'

import type { ReactNode } from 'react'

export interface Option<T extends string> {
  value: T
  label: ReactNode
  /** Secondary line under the label, e.g. an example time. */
  description?: ReactNode
  /** Language of the label when it differs from the page (e.g. "اردو" on an English page). */
  lang?: string
  dir?: 'ltr' | 'rtl'
}

/**
 * A segmented single-choice control built on native radio inputs.
 *
 * Native radios, visually hidden but still focusable, give the keyboard model
 * for free - Tab into the group, arrow keys to move and select - and screen
 * readers announce "radio button, 1 of 2". The visible pill tracks the input
 * through `peer-checked` / `peer-focus-visible`.
 */
export function OptionGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled = false,
}: {
  legend: string
  name: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer has-[:disabled]:cursor-not-allowed">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              lang={option.lang}
              dir={option.dir}
              className="flex flex-col items-center px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors bg-bg-elevated text-content-secondary hover:text-content-primary peer-checked:bg-accent-green peer-checked:text-bg-primary peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-accent-green peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg-surface peer-disabled:opacity-60"
            >
              <span>{option.label}</span>
              {option.description && (
                <span className="text-[10px] font-normal opacity-80 tabular-nums">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
