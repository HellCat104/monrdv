import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'MonRDV — Prise de rendez-vous médical au Maroc',
    template: '%s | MonRDV',
  },
  description: 'Trouvez un médecin et prenez rendez-vous en ligne au Maroc. Médecin généraliste, cardiologue, dermatologue, pédiatre et plus — disponible 24h/24 à Casablanca, Rabat, Marrakech et partout au Maroc.',
  keywords: ['rendez-vous médical Maroc', 'médecin en ligne Maroc', 'prise de rendez-vous médecin', 'médecin Casablanca', 'médecin Rabat', 'médecin Marrakech', 'MonRDV'],
  authors: [{ name: 'MonRDV' }],
  creator: 'MonRDV',
  metadataBase: new URL('https://monrdv.vercel.app'),
  openGraph: {
    title: 'MonRDV — Prise de rendez-vous médical au Maroc',
    description: 'Trouvez un médecin et prenez rendez-vous en ligne au Maroc. Disponible 24h/24.',
    url: 'https://monrdv.vercel.app',
    siteName: 'MonRDV',
    locale: 'fr_MA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MonRDV — Prise de rendez-vous médical au Maroc',
    description: 'Trouvez un médecin et prenez rendez-vous en ligne au Maroc.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
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
