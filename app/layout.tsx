import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://monrdv.ma'

export const metadata: Metadata = {
  title: {
    default: 'MonRDV — Prise de rendez-vous médical en ligne au Maroc',
    template: '%s | MonRDV',
  },
  description:
    'Trouvez un médecin et prenez rendez-vous en ligne au Maroc. Médecin généraliste, cardiologue, dermatologue, pédiatre — confirmation SMS immédiate, disponible 24h/24 à Casablanca, Rabat, Marrakech.',
  keywords: [
    'rendez-vous médical Maroc',
    'médecin en ligne Maroc',
    'prise de rendez-vous médecin',
    'médecin Casablanca',
    'médecin Rabat',
    'médecin Marrakech',
    'MonRDV',
  ],
  authors: [{ name: 'MonRDV' }],
  creator: 'MonRDV',
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: 'MonRDV — Prise de rendez-vous médical en ligne au Maroc',
    description: 'Trouvez un médecin et prenez rendez-vous en ligne au Maroc. Confirmation immédiate, 24h/24.',
    url: APP_URL,
    siteName: 'MonRDV',
    locale: 'fr_MA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MonRDV — Prise de rendez-vous médical en ligne au Maroc',
    description: 'Trouvez un médecin et prenez rendez-vous en ligne au Maroc. 24h/24.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
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
