import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { TopNav } from '@/components/layout/TopNav'
import { BottomNav } from '@/components/layout/BottomNav'
import { LeftSidebar } from '@/components/layout/LeftSidebar'
import { RightSidebar } from '@/components/layout/RightSidebar'

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
          <div className="pt-14 min-h-screen">
            <div className="max-w-[1100px] mx-auto lg:flex">
              {/* Left sidebar — Top leagues */}
              <div className="hidden lg:block w-52 shrink-0 border-r border-divider sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
                <LeftSidebar />
              </div>

              {/* Main content */}
              <main className="flex-1 min-w-0 pb-16 lg:pb-0 border-r border-divider">
                {children}
              </main>

              {/* Right sidebar — widgets */}
              <div className="hidden xl:block w-60 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
                <RightSidebar />
              </div>
            </div>
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  )
}
