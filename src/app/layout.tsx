import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'FamilyPulse',
    template: '%s | FamilyPulse',
  },
  description:
    'Family health dashboard that aggregates wearable data, detects patterns, and delivers coordinated recommendations grounded in trusted medical sources.',
  keywords: ['family health', 'health dashboard', 'wearable data', 'health tracking', 'wellness'],
  authors: [{ name: 'FamilyPulse' }],
  creator: 'FamilyPulse',
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'FamilyPulse',
    description: 'Your family health dashboard. Together, healthier.',
    siteName: 'FamilyPulse',
  },
  icons: {
    icon: '/favicon.ico',
  },
  robots: {
    index: false,  // Private app — do not index
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <head />
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        {/* Main app container */}
        <div className="relative min-h-screen">
          {/* Subtle background texture */}
          <div
            className="pointer-events-none fixed inset-0 z-0 opacity-40"
            style={{
              background:
                'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.08) 0%, transparent 60%), ' +
                'radial-gradient(ellipse 60% 40% at 80% 110%, rgba(16,185,129,0.05) 0%, transparent 60%)',
            }}
            aria-hidden="true"
          />
          {/* Content */}
          <div className="relative z-10">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}
