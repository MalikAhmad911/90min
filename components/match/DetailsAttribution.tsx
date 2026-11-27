import { HIGHLIGHTLY_ATTRIBUTION } from '@/lib/providers/highlightly/leagues'

/** "Match data: Highlightly" - shown under any tab whose data came from Highlightly. */
export function DetailsAttribution({ source }: { source: 'highlightly' | null | undefined }) {
  if (source !== 'highlightly') return null
  return (
    <p className="px-4 py-2.5 text-[10px] leading-relaxed text-content-muted border-t border-divider">
      Match data:{' '}
      <a
        href={HIGHLIGHTLY_ATTRIBUTION.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-content-secondary"
      >
        {HIGHLIGHTLY_ATTRIBUTION.provider}
      </a>
    </p>
  )
}
