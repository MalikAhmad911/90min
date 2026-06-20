'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { FreeStream } from '@/lib/tv/types'

interface StreamPlayerProps {
  stream: FreeStream
  /** Heading shown above the video, e.g. "Liverpool vs Arsenal" */
  title: string
  onClose: () => void
}

function HlsVideo({ src, onError }: { src: string; onError: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Safari (and iOS) play HLS natively.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }

    let destroyed = false
    let hls: import('hls.js').default | null = null

    // Lazy-load hls.js so it never ships with non-Watch pages.
    import('hls.js').then(({ default: Hls }) => {
      if (destroyed) return
      if (!Hls.isSupported()) {
        onError()
        return
      }
      hls = new Hls({ enableWorker: true })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) onError()
      })
    })

    return () => {
      destroyed = true
      hls?.destroy()
    }
  }, [src, onError])

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      className="w-full h-full bg-black"
    />
  )
}

export function StreamPlayer({ stream, title, onClose }: StreamPlayerProps) {
  const [failed, setFailed] = useState(false)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Watch ${title}`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-bg-surface rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-divider">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-primary truncate">{title}</p>
            <p className="text-[11px] text-content-muted truncate">{stream.title}</p>
          </div>
          <button
            type="button"
            aria-label="Close player"
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-elevated transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Video area (16:9) */}
        <div className="relative aspect-video bg-black">
          {failed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-content-muted px-6 text-center">
              <p className="text-sm font-medium text-content-secondary">Stream unavailable</p>
              <p className="text-xs">This feed could not be played. Try a broadcaster listed below.</p>
            </div>
          ) : stream.kind === 'youtube' ? (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${stream.src}?autoplay=1`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <HlsVideo src={stream.src} onError={() => setFailed(true)} />
          )}
        </div>
      </div>
    </div>
  )
}
