// Page d'accueil — server component pour permettre l'export de metadata SEO
import type { Metadata } from 'next'
import HomePageClient from './HomePageClient'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://monrdv.ma'

export const metadata: Metadata = {
  title: 'MonRDV — Prise de rendez-vous médical en ligne au Maroc',
  description:
    'Trouvez un médecin et prenez rendez-vous en ligne au Maroc en 2 minutes. Médecin généraliste, cardiologue, dermatologue, pédiatre à Casablanca, Rabat, Marrakech — confirmation SMS immédiate, 24h/24.',
  keywords: [
    'rendez-vous médical Maroc',
    'prise de rendez-vous médecin Maroc',
    'médecin en ligne Maroc',
    'médecin Casablanca',
    'médecin Rabat',
    'médecin Marrakech',
    'téléconsultation Maroc',
    'MonRDV',
  ],
  alternates: {
    canonical: APP_URL,
  },
  openGraph: {
    title: 'MonRDV — Prise de rendez-vous médical en ligne au Maroc',
    description:
      'Trouvez un médecin et prenez rendez-vous en ligne au Maroc. Confirmation immédiate par email, 24h/24.',
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
}

// Données structurées JSON-LD pour Google (WebSite + SearchAction)
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${APP_URL}/#website`,
      url: APP_URL,
      name: 'MonRDV',
      description: 'Prise de rendez-vous médicaux en ligne au Maroc',
      inLanguage: 'fr-MA',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${APP_URL}/recherche?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': `${APP_URL}/#organization`,
      name: 'MonRDV',
      url: APP_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${APP_URL}/favicon.ico`,
      },
      areaServed: 'MA',
      description: 'Plateforme marocaine de prise de rendez-vous médicaux en ligne',
    },
  ],
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePageClient />
    </>
  )
}
