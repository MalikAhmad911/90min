import type { MetadataRoute } from 'next'

/** Makes the site installable ("Add to Home Screen") on Android, iOS and desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '90 Min Tactics – Live Football Scores',
    short_name: '90 Min',
    description: 'Live football scores, tables, lineups and stats.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    categories: ['sports', 'news'],
    icons: [
      { src: '/app-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
