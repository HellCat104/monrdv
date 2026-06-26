// Page publique de réservation — accessible via /dr-hassan ou /slug-medecin
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BookingPageClient } from './BookingPageClient'
import Link from 'next/link'
import type { Metadata } from 'next'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma'

interface Props {
  params: { slug: string }
}

// Mise en cache React — une seule requête DB par rendu même si appelée plusieurs fois
const getDoctor = cache(async (slug: string) => {
  const supabase = createClient()
  // Projection EXPLICITE : ne jamais sérialiser vers le navigateur les colonnes
  // sensibles (email, cnom_number, document_url, rejection_reason, ice, inpe…).
  const { data } = await supabase
    .from('doctors')
    .select('id, name, slug, specialty, specialties, photo_url, address, city, bio, appointment_duration, working_hours, phone, subscription_status, status')
    .eq('slug', slug)
    .eq('status', 'approved')
    .single()
  return data
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = params.slug.replace(/^dr-/, '')
  const doctor = await getDoctor(slug)

  if (!doctor) return { title: 'Médecin introuvable | MonRDV', robots: { index: false } }

  const cityPart = doctor.city ? ` à ${doctor.city}` : ''
  const title = `Dr. ${doctor.name} — ${doctor.specialty}${cityPart} | MonRDV`
  const description = doctor.bio
    ? `${doctor.bio.substring(0, 120)}… Prenez rendez-vous en ligne avec Dr. ${doctor.name}${cityPart} sur MonRDV.`
    : `Prenez rendez-vous en ligne avec Dr. ${doctor.name}, ${doctor.specialty}${cityPart}. Confirmation immédiate, disponible 24h/24 sur MonRDV.`

  const canonicalSlug = params.slug.startsWith('dr-') ? params.slug : `dr-${params.slug}`

  return {
    title,
    description,
    keywords: [
      `Dr. ${doctor.name}`,
      `${doctor.specialty}${cityPart}`,
      `rendez-vous ${doctor.specialty}`,
      `médecin ${doctor.city ?? 'Maroc'}`,
      'MonRDV',
    ],
    alternates: {
      canonical: `${APP_URL}/${canonicalSlug}`,
    },
    openGraph: {
      title,
      description,
      url: `${APP_URL}/${canonicalSlug}`,
      type: 'profile',
    },
  }
}

export default async function BookingPage({ params }: Props) {
  const slug = params.slug.replace(/^dr-/, '')
  // Réutilise le cache React — pas de 2ème requête DB
  const doctor = await getDoctor(slug)

  if (!doctor) notFound()

  // Motifs de consultation du médecin (RLS : lecture publique des motifs actifs)
  const supabase = createClient()
  const { data: consultationTypes } = await supabase
    .from('consultation_types')
    .select('id, doctor_id, name, duration_minutes, active, created_at')
    .eq('doctor_id', doctor.id)
    .eq('active', true)
    .order('created_at', { ascending: true })

  // Médecin inactif → page d'erreur propre
  if (doctor.subscription_status !== 'actif') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⏸️</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Dr. {doctor.name} n&apos;est pas disponible
          </h1>
          <p className="text-gray-500 mb-8">
            Ce médecin ne prend pas de rendez-vous en ligne pour le moment.
            Contactez-le directement par téléphone.
          </p>
          {doctor.phone && (
            <a
              href={`tel:${doctor.phone}`}
              className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors mb-4"
            >
              📞 Appeler le {doctor.phone}
            </a>
          )}
          <div className="mt-4">
            <Link href="/recherche" className="text-sm text-gray-400 hover:text-primary-500">
              ← Rechercher un autre médecin
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Données structurées JSON-LD — Physician schema pour Google
  const cityPart = doctor.city ? ` à ${doctor.city}` : ''
  const canonicalSlug = `dr-${slug}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: `Dr. ${doctor.name}`,
    medicalSpecialty: doctor.specialty,
    description: doctor.bio ?? `${doctor.specialty}${cityPart}. Prise de rendez-vous en ligne sur MonRDV.`,
    url: `${APP_URL}/${canonicalSlug}`,
    ...(doctor.city && {
      address: {
        '@type': 'PostalAddress',
        addressLocality: doctor.city,
        addressCountry: 'MA',
        ...(doctor.address && { streetAddress: doctor.address }),
      },
    }),
    ...(doctor.phone && { telephone: doctor.phone }),
    ...(doctor.photo_url && { image: doctor.photo_url }),
    availableService: {
      '@type': 'MedicalTherapy',
      name: 'Consultation médicale',
    },
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${APP_URL}/${canonicalSlug}`,
        actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'],
      },
      result: {
        '@type': 'Reservation',
        name: 'Rendez-vous médical',
      },
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <BookingPageClient doctor={doctor} consultationTypes={consultationTypes ?? []} />
    </>
  )
}
