import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import VersionPerimee from '@/components/shared/VersionPerimee'

const inter = Inter({ subsets: ['latin'] })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma'

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
      <head>
        {/* La file `dataLayer` est créée tout de suite (quelques octets) : les
            mesures émises avant l'arrivée du script Google y attendent, rien
            n'est perdu. Le script lui-même est chargé plus bas, après coup. */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-J76BEBZT5D');
        `}} />
      </head>
      <body className={inter.className}>
        {children}
        {/* Un onglet resté ouvert sur une version remplacée se recharge de
            lui-même au lieu de rester cassé (components/shared/VersionPerimee). */}
        <VersionPerimee />
        {/* Google Analytics APRÈS que la page est devenue utilisable.
            Mesuré le 16-11-2026 : gtag.js pèse 196 ko compressés (595 ko
            bruts) — plus que tout le code de l'accueil hors Sentry. Placé
            `async` dans le <head>, il partait dès la première milliseconde et
            se disputait la bande passante avec la feuille de style, la police
            et le code de la page ; sur un partage de connexion 4G, c'est la
            page elle-même qui arrivait plus tard. `lazyOnload` (Next.js, pas
            l'hébergeur) ne l'injecte qu'une fois la page entièrement chargée,
            quand le navigateur est au repos : la visite est toujours comptée
            (la file `dataLayer` l'attend), la page n'attend plus pour elle.
            ⚠ Pas `afterInteractive` : dans l'App Router, Next émet alors un
            <link rel="preload"> dans le <head> — le script repartirait en
            tête de file, en priorité haute, soit pire qu'avant. Vérifié dans
            le HTML produit. */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-J76BEBZT5D"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}
