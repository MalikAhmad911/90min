'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Radio, Plus, Trash2 } from 'lucide-react'
import type { Channel } from '@/lib/tv/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ChannelManager() {
  const { data, mutate } = useSWR<{ channels: Channel[] }>('/api/channels', fetcher)
  const channels = data?.channels ?? []

  const [name, setName] = useState('')
  const [kind, setKind] = useState<Channel['kind']>('youtube')
  const [src, setSrc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post(body: unknown) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Failed')
        return false
      }
      mutate(json, { revalidate: false })
      return true
    } catch {
      setError('Network error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (!name.trim() || !src.trim()) {
      setError('Name and link are required')
      return
    }
    const ok = await post({ action: 'add', channel: { name, kind, src } })
    if (ok) {
      setName('')
      setSrc('')
    }
  }

  return (
    <div className="bg-bg-surface border border-divider rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-2.5 border-b border-divider">
        <span className="text-[13px] font-semibold text-content-primary flex items-center gap-1.5">
          <Radio size={14} className="text-accent-green" /> Live TV channels
        </span>
        <p className="text-[11px] text-content-muted mt-0.5">
          Standalone streams that play directly on the Watch page — no match needed.
        </p>
      </div>

      {/* Existing channels */}
      <div className="divide-y divide-divider">
        {channels.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-4 py-2">
            <span className="text-[13px] text-content-primary font-medium flex-1 truncate">{c.name}</span>
            <span className="text-[10px] uppercase text-content-muted bg-bg-elevated rounded px-1.5 py-0.5">{c.kind}</span>
            <button
              type="button"
              onClick={() => post({ action: 'remove', id: c.id })}
              disabled={busy}
              className="p-1 rounded text-content-muted hover:text-live-red disabled:opacity-60"
              aria-label={`Remove ${c.name}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {channels.length === 0 && (
          <p className="text-[12px] text-content-muted px-4 py-2">No channels yet — add one below.</p>
        )}
      </div>

      {/* Add form */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-divider bg-bg-elevated/30">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Channel name"
          className="w-36 bg-bg-elevated text-content-primary text-[12px] rounded-md px-2 py-1 border border-divider focus:outline-none focus:ring-1 focus:ring-accent-green"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Channel['kind'])}
          className="bg-bg-elevated text-content-primary text-[12px] rounded-md px-2 py-1 border border-divider focus:outline-none"
        >
          <option value="youtube">YouTube</option>
          <option value="hls">HLS (.m3u8)</option>
        </select>
        <input
          type="text"
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          placeholder={kind === 'youtube' ? 'YouTube video ID' : 'https://…/stream.m3u8'}
          className="flex-1 min-w-[180px] bg-bg-elevated text-content-primary text-[12px] rounded-md px-2 py-1 border border-divider focus:outline-none focus:ring-1 focus:ring-accent-green"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent-green text-bg-primary text-[12px] font-semibold hover:opacity-90 disabled:opacity-60"
        >
          <Plus size={12} /> Add
        </button>
        {error && <span className="text-[11px] text-live-red w-full">{error}</span>}
      </div>
    </div>
  )
}
