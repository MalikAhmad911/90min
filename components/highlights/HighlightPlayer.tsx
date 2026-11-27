'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { embedUrl, thumbnailUrl, watchUrl } from '@/lib/highlights/youtube'

/**
 * A YouTube highlight that costs nothing until it is wanted: the thumbnail is
 * a plain image and the iframe (about 1 MB of player) loads only on click.
 */
export function HighlightPlayer({
  videoId,
  title,
  channelName,
  publishedLabel,
}: {
  videoId: string
  title: string
  channelName: string
  publishedLabel?: string
}) {
  const [playing, setPlaying] = useState(false)
  const thumb = thumbnailUrl(videoId)
  const embed = embedUrl(videoId, { autoplay: true })
  const watch = watchUrl(videoId)
  if (!thumb || !embed || !watch) return null

  return (
    <figure className="bg-bg-surface rounded-lg overflow-hidden">
      <div className="relative aspect-video bg-black">
        {playing ? (
          <iframe
            src={embed}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play: ${title}`}
            className="group absolute inset-0 h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed host, lazy, no optimisation needed */}
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-live-red text-white shadow-lg group-hover:scale-110 transition-transform">
                <Play size={22} className="ms-0.5" fill="currentColor" />
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="px-3 py-2">
        <p className="text-[13px] font-medium text-content-primary line-clamp-2">{title}</p>
        <p className="mt-0.5 text-[11px] text-content-muted">
          {channelName}
          {publishedLabel ? ` · ${publishedLabel}` : ''} ·{' '}
          <a
            href={watch}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-content-primary underline-offset-2 hover:underline"
          >
            Watch on YouTube
          </a>
        </p>
      </figcaption>
    </figure>
  )
}
