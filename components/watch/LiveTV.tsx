'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Radio, Play } from 'lucide-react'
import { StreamPlayer } from './StreamPlayer'
import type { Channel, FreeStream } from '@/lib/tv/types'
import { litePollInterval, useLiteMode } from '@/hooks/useLiteMode'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** Standalone Live TV channels that play directly — independent of matches. */
export function LiveTV() {
  const { enabled: lite } = useLiteMode()
  const { data } = useSWR<{ channels: Channel[] }>('/api/channels', fetcher, {
    refreshInterval: litePollInterval(60_000, lite),
  })
  const channels = data?.channels ?? []
  const [active, setActive] = useState<Channel | null>(null)

  if (channels.length === 0) return null

  const stream: FreeStream | null = active
    ? { kind: active.kind, src: active.src, title: active.name }
    : null

  return (
    <div className="px-2 pt-3">
      <div className="flex items-center gap-1.5 px-2 mb-2">
        <Radio size={15} className="text-accent-green" />
        <span className="text-[13px] font-semibold text-content-primary">Live TV</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-2 pb-1">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c)}
            className="shrink-0 w-40 text-left bg-bg-surface border border-divider rounded-lg p-3 hover:bg-bg-elevated transition-colors"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-accent-green text-bg-primary mb-2">
              <Play size={15} className="fill-current" />
            </div>
            <p className="text-[13px] font-semibold text-content-primary truncate">{c.name}</p>
            <p className="text-[11px] text-content-muted uppercase">{c.kind}</p>
          </button>
        ))}
      </div>

      {active && stream && (
        <StreamPlayer stream={stream} title={active.name} onClose={() => setActive(null)} />
      )}
    </div>
  )
}
