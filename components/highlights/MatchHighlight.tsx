'use client'

import useSWR from 'swr'
import { HighlightPlayer } from './HighlightPlayer'

interface Video {
  videoId: string
  title: string
  channelName: string
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { video: null }))

/** The official highlights of a match, when the league has published them. */
export function MatchHighlight({ matchId, status }: { matchId: number; status: string }) {
  const eligible = status === 'FINISHED' || status === 'IN_PLAY' || status === 'PAUSED'
  const { data } = useSWR<{ video: Video | null }>(
    eligible ? `/api/highlights?match=${matchId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const video = data?.video
  if (!video) return null

  return (
    <section className="mx-2 mt-2" aria-label="Highlights">
      <h2 className="px-2 pb-1.5 text-[12px] font-semibold uppercase tracking-wide text-content-muted">
        Highlights
      </h2>
      <HighlightPlayer videoId={video.videoId} title={video.title} channelName={video.channelName} />
    </section>
  )
}
