import { ImageResponse } from 'next/og'

/**
 * PNG app icons for the web manifest, drawn at build time from the brand
 * colours. Only the two sizes browsers ask for exist; anything else is 404.
 * The mark sits inside the central 80% so the maskable crop never cuts it.
 */

const SIZES = [192, 512] as const

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }))
}

export const dynamicParams = false

export function GET(_req: Request, { params }: { params: { size: string } }) {
  const size = Number(params.size)
  if (!SIZES.includes(size as (typeof SIZES)[number])) {
    return new Response('Not found', { status: 404 })
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
        }}
      >
        <div
          style={{
            width: '64%',
            height: '64%',
            borderRadius: '50%',
            border: `${Math.round(size * 0.035)}px solid #39FF14`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#39FF14',
            fontSize: Math.round(size * 0.26),
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          90
        </div>
      </div>
    ),
    { width: size, height: size }
  )
}
