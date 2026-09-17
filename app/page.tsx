// Page d'accueil — server component pour permettre l'export de metadata SEO
import type { Metadata } from 'next'
import HomePageClient from './HomePageClient'
import { MaillageSEO, FAQ, QUESTIONS_FREQUENTES } from '@/components/home/MaillageSEO'
import { chargerLiensSEO } from '@/lib/seo-liens'

// Régénérée au maximum une fois par heure : le maillage suit les médecins
// inscrits sans recalculer la page à chaque visite.
export const revalidate = 3600

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma'

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
      // Balisage des questions fréquentes : Google peut afficher ces réponses
      // directement dans ses résultats, ce qui gagne de la place sur la page
      // sans dépendre du classement.
      '@type': 'FAQPage',
      '@id': `${APP_URL}/#faq`,
      mainEntity: QUESTIONS_FREQUENTES.map(({ q, r }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: r },
      })),
    },
    {
      // `MedicalBusiness` plutôt qu'`Organization` : c'est un sous-type
      // d'Organization, donc rien n'est perdu, mais il accepte en plus les
      // propriétés d'un établissement de santé — adresse, coordonnées GPS,
      // tarifs, devise. Un SEUL nœud décrit MonRDV, sous le même `@id` :
      // publier côte à côte une Organization et un MedicalBusiness portant le
      // même nom aurait présenté à Google deux entités concurrentes.
      '@type': 'MedicalBusiness',
      '@id': `${APP_URL}/#organization`,
      name: 'MonRDV',
      url: APP_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${APP_URL}/favicon.ico`,
      },
      description:
        'Plateforme marocaine de prise de rendez-vous médicaux en ligne et de gestion de cabinet',
      // Les deux forfaits réellement affichés sur la page Abonnement.
      // Un tarif balisé doit correspondre à ce que le visiteur lit.
      priceRange: '149 MAD - 249 MAD',
      currenciesAccepted: 'MAD',
      areaServed: {
        '@type': 'Country',
        name: 'Maroc',
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Rabat',
        addressRegion: 'Rabat-Salé-Kénitra',
        addressCountry: 'MA',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 34.020882,
        longitude: -6.841650,
      },
    },
  ],
}

export default async function HomePage() {
  const { villes, specialites } = await chargerLiensSEO()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <HomePageClient>
        <MaillageSEO villes={villes} specialites={specialites} />
        <FAQ />
      </HomePageClient>
    </>
  )
}
