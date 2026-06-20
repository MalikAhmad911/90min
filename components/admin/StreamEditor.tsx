'use client'

import { useState } from 'react'
import { Save, Trash2, Check } from 'lucide-react'
import type { FreeStream } from '@/lib/tv/types'

interface StreamEditorProps {
  scope: 'match' | 'competition'
  storeKey: string
  current?: FreeStream
  onSaved: (overrides: unknown) => void
}

/** Inline editor to set/remove a single stream override (match or competition). */
export function StreamEditor({ scope, storeKey, current, onSaved }: StreamEditorProps) {
  const [kind, setKind] = useState<FreeStream['kind']>(current?.kind ?? 'youtube')
  const [src, setSrc] = useState(current?.src ?? '')
  const [title, setTitle] = useState(current?.title ?? '')
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(stream: FreeStream | null) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, key: storeKey, stream }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        return
      }
      onSaved(data)
      if (stream === null) {
        setSrc('')
        setTitle('')
      }
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1500)
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  function onSave() {
    if (!src.trim()) {
      setError('Stream URL / ID required')
      return
    }
    send({ kind, src: src.trim(), title: title.trim() || (kind === 'youtube' ? 'Live stream' : 'Stream') })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as FreeStream['kind'])}
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
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Label (optional)"
        className="w-32 bg-bg-elevated text-content-primary text-[12px] rounded-md px-2 py-1 border border-divider focus:outline-none focus:ring-1 focus:ring-accent-green"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent-green text-bg-primary text-[12px] font-semibold hover:opacity-90 disabled:opacity-60"
      >
        {justSaved ? <Check size={12} /> : <Save size={12} />}
        {justSaved ? 'Saved' : 'Save'}
      </button>
      {current && (
        <button
          type="button"
          onClick={() => send(null)}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-elevated text-content-secondary text-[12px] hover:text-live-red disabled:opacity-60"
        >
          <Trash2 size={12} />
          Remove
        </button>
      )}
      {error && <span className="text-[11px] text-live-red w-full">{error}</span>}
    </div>
  )
}
