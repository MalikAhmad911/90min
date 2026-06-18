import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { TopNav } from '@/components/layout/TopNav'
import { BottomNav } from '@/components/layout/BottomNav'
import { Sidebar } from '@/components/layout/Sidebar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: '90 Min Tactics — Live Football Scores',
  description: 'Real-time football scores, lineups, tables and stats.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-bg-primary text-content-primary antialiased`}>
        <ThemeProvider>
          <TopNav />
          <div className="pt-14 flex min-h-[calc(100vh-3.5rem)]">
            <Sidebar />
            <main className="flex-1 pb-16 lg:pb-0">
              {children}
            </main>
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  )
}
