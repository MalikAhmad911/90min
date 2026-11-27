import { Clock, Search } from 'lucide-react'
import { Crest } from '@/components/ui/Crest'
import { TeamCrest } from '@/components/ui/TeamCrest'
import type { SearchItemType } from './types'

/**
 * The picture-and-two-lines row body shared by the dropdown and the /search
 * page. Not a client component itself: the server page renders it directly,
 * and the crests inside hydrate on their own.
 */

interface ResultVisualProps {
  type: SearchItemType | 'query'
  label: string
  sublabel?: string
  image?: string | null
  /** Second crest and name, for a match. */
  image2?: string | null
  label2?: string
  /** Recent entries get a clock badge so they read as history. */
  recent?: boolean
  size?: number
}

export function ResultVisual({
  type,
  label,
  sublabel,
  image,
  image2,
  label2,
  recent = false,
  size = 24,
}: ResultVisualProps) {
  return (
    <span className="flex items-center gap-3 min-w-0 w-full">
      {/* Decorative: the label beside it already names the entity, and an alt
          text here would make screen readers read every name twice. */}
      <span aria-hidden="true" className="shrink-0 inline-flex">
        <ResultImage type={type} label={label} image={image} image2={image2} label2={label2} size={size} />
      </span>
      <span className="flex flex-col min-w-0 flex-1">
        <span className="truncate text-sm font-medium text-content-primary">{label}</span>
        {sublabel ? <span className="truncate text-xs text-content-secondary">{sublabel}</span> : null}
      </span>
      {recent && type !== 'query' ? (
        <Clock size={13} aria-hidden="true" className="shrink-0 text-content-muted" />
      ) : null}
    </span>
  )
}

function ResultImage({
  type,
  label,
  image,
  image2,
  label2,
  size,
}: Required<Pick<ResultVisualProps, 'type' | 'label' | 'size'>> &
  Pick<ResultVisualProps, 'image' | 'image2' | 'label2'>) {
  if (type === 'query') {
    return (
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center rounded-full bg-bg-elevated text-content-muted"
        style={{ width: size, height: size }}
      >
        <Clock size={Math.round(size * 0.55)} />
      </span>
    )
  }
  if (type === 'match') {
    // Two overlapping crests read as "a fixture" at a glance.
    const small = Math.round(size * 0.75)
    return (
      <span aria-hidden="true" className="relative shrink-0" style={{ width: size, height: size }}>
        <span className="absolute left-0 top-0">
          <TeamCrest src={image} name={label} size={small} />
        </span>
        <span className="absolute right-0 bottom-0">
          <TeamCrest src={image2} name={label2 ?? label} size={small} />
        </span>
      </span>
    )
  }
  if (type === 'team') return <TeamCrest src={image} name={label} size={size} />
  return <Crest src={image} name={label} size={size} className={type === 'player' ? 'rounded-full overflow-hidden' : ''} />
}

/** The "see all results" row. */
export function SeeAllVisual({ query }: { query: string }) {
  return (
    <span className="flex items-center gap-3 min-w-0 w-full text-sm text-accent-green-dim">
      <Search size={15} aria-hidden="true" className="shrink-0" />
      <span className="truncate">
        See all results for <span className="font-semibold">“{query}”</span>
      </span>
    </span>
  )
}
