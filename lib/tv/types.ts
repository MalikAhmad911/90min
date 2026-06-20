export interface Country {
  /** ISO 3166-1 alpha-2 code, e.g. 'GB' */
  code: string
  name: string
  /** Emoji flag */
  flag: string
}

export interface Broadcaster {
  name: string
  /** Where-to-watch link (broadcaster home / live page) */
  url: string
  /** 'tv' = traditional channel, 'stream' = streaming service */
  kind: 'tv' | 'stream'
}

export interface FreeStream {
  kind: 'youtube' | 'hls'
  /** YouTube video id (for 'youtube') or full m3u8 URL (for 'hls') */
  src: string
  title: string
}
