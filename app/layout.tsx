import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MonRDV — Prise de rendez-vous médical au Maroc',
  description: 'Plateforme de gestion de rendez-vous pour cabinets médicaux au Maroc',
  icons: {
    icon: '/favicon.ico',
  },
  verification: {
    google: 'I4tbnd-F6oxBxsUJ-UveJ44wSRmv48m9bRuUTdSeLHg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
