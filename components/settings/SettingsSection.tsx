import { useId, type ReactNode } from 'react'

/** A titled card. `aria-labelledby` makes each card a named region for screen readers. */
export function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="bg-bg-surface rounded-lg overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <h2 id={headingId} className="text-[13px] font-semibold text-content-primary">
          {title}
        </h2>
        {hint && <p className="text-[11px] text-content-muted mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

/** Placeholder shaped like a control row, shown until browser-only state is readable. */
export function SettingSkeleton() {
  return <div className="h-9 rounded-full animate-shimmer" aria-hidden="true" />
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[12px] text-live-red mt-2">
      {children}
    </p>
  )
}
