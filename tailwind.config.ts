import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './providers/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0A0A0A',
          surface: '#141414',
          elevated: '#1E1E1E',
        },
        accent: {
          green: '#39FF14',
          'green-dim': '#22C55E',
        },
        content: {
          primary: '#FFFFFF',
          secondary: '#A3A3A3',
          muted: '#525252',
        },
        divider: '#262626',
        live: {
          red: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'live-pulse': 'live-pulse 1.5s ease-in-out infinite',
        'score-pop': 'score-pop 0.4s ease-out',
      },
      keyframes: {
        'live-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'score-pop': {
          '0%': { transform: 'scale(1.15)', color: '#39FF14' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
