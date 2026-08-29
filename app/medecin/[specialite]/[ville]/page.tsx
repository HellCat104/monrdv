export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { displayName } from '@/lib/profession'
import Link from 'next/link'
import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { getSpecialiteFromSlug, getVilleFromSlug, SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'
import { MapPin, Clock, Phone, Star } from 'lucide-react'
import { LogoMonRDV } from '@/components/shared/LogoMonRDV'

interface Props {
  params: { specialite: string; ville: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const specialite = getSpecialiteFromSlug(params.specialite)
  const ville      = getVilleFromSlug(params.ville)
  if (!specialite || !ville) return {}

  const title       = `${specialite} à ${ville} — Prise de RDV en ligne`
  const description = `Trouvez un ${specialite.toLowerCase()} à ${ville} et prenez rendez-vous en ligne gratuitement sur MonRDV. Disponible 24h/24, confirmation immédiate.`

  return {
    title,
    description,
    keywords: [`${specialite} ${ville}`, `rendez-vous ${specialite} ${ville}`, `médecin ${ville}`, `MonRDV ${ville}`],
    openGraph: { title, description, type: 'website' },
    alternates: {
      canonical: `/medecin/${params.specialite}/${params.ville}`,
    },
  }
}


export default async function MedecinSpecialiteVillePage({ params }: Props) {
  const specialite = getSpecialiteFromSlug(params.specialite)
  const ville      = getVilleFromSlug(params.ville)

  if (!specialite || !ville) notFound()

  const supabase = createAdminClient()
  const { data: doctors } = await supabase
    .from('doctors')
    .select('id, name, specialty, slug, phone, city, appointment_duration')
    .eq('status', 'approved')
    .eq('subscription_status', 'actif')
    .contains('specialties', [specialite])
    .eq('city', ville)
    .order('name', { ascending: true })

  // Données structurées JSON-LD pour Google
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    'name': `${specialite} à ${ville} — MonRDV`,
    'description': `Liste de ${specialite.toLowerCase()} à ${ville} disponibles sur MonRDV`,
    'url': `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma'}/medecin/${params.specialite}/${params.ville}`,
    'areaServed': ville,
    'medicalSpecialty': specialite,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-2">
            <Link href="/"><LogoMonRDV taille={34} /></Link>
            <span className="text-gray-300">/</span>
            <Link href="/recherche" className="text-gray-500 text-sm hover:text-primary-500">Recherche</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-700 text-sm">{specialite} à {ville}</span>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Hero SEO */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {specialite} à {ville}
            </h1>
            <p className="text-gray-500">
              {doctors && doctors.length > 0
                ? `${doctors.length} médecin${doctors.length > 1 ? 's' : ''} disponible${doctors.length > 1 ? 's' : ''} — Prenez rendez-vous en ligne gratuitement`
                : `Prenez rendez-vous avec un ${specialite.toLowerCase()} à ${ville} en ligne`
              }
            </p>
          </div>

          {/* Liste des médecins */}
          {doctors && doctors.length > 0 ? (
            <div className="space-y-4">
              {doctors.map((doctor) => (
                <div key={doctor.id} className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-xl shrink-0">
                      {doctor.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{displayName(doctor.name, doctor.specialty)}</h2>
                      <p className="text-sm text-primary-600">{specialite}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {doctor.city}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {doctor.appointment_duration} min
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/dr-${doctor.slug}`}
                    className="shrink-0 bg-primary-500 hover:bg-primary-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Prendre RDV
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="text-gray-500 mb-4">Aucun {specialite.toLowerCase()} disponible à {ville} pour le moment.</p>
              <Link
                href={`/recherche?q=${encodeURIComponent(specialite)}`}
                className="text-primary-500 hover:underline text-sm"
              >
                Voir tous les {specialite.toLowerCase()}s au Maroc →
              </Link>
            </div>
          )}

          {/* Contenu SEO */}
          <div className="mt-12 bg-white rounded-2xl border border-gray-100 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Prendre rendez-vous avec un {specialite.toLowerCase()} à {ville}
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              MonRDV vous permet de trouver facilement un {specialite.toLowerCase()} à {ville} et de prendre
              rendez-vous en ligne en quelques clics. Notre plateforme recense les meilleurs professionnels
              de santé à {ville}, tous vérifiés et certifiés par l&apos;Ordre des Médecins du Maroc.
            </p>
            <p className="text-gray-600 leading-relaxed">
              La prise de rendez-vous est <strong>gratuite</strong> et disponible <strong>24h/24 et 7j/7</strong>.
              Vous recevrez une confirmation immédiate de votre rendez-vous.
            </p>
          </div>

          {/* Autres villes */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {specialite} dans d&apos;autres villes
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(VILLE_SLUGS)
                .filter(([slug]) => slug !== params.ville)
                .slice(0, 8)
                .map(([slug, nom]) => (
                  <Link
                    key={slug}
                    href={`/medecin/${params.specialite}/${slug}`}
                    className="text-sm bg-white border border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {nom}
                  </Link>
                ))}
            </div>
          </div>

          {/* Autres spécialités */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Autres spécialités à {ville}
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SPECIALITE_SLUGS)
                .filter(([slug]) => slug !== params.specialite)
                .slice(0, 8)
                .map(([slug, nom]) => (
                  <Link
                    key={slug}
                    href={`/medecin/${slug}/${params.ville}`}
                    className="text-sm bg-white border border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {nom}
                  </Link>
                ))}
            </div>
          </div>
        </main>

        <footer className="border-t border-gray-100 py-6 px-4 text-center text-sm text-gray-400 mt-8">
          <Link href="/" className="hover:text-primary-500">← Retour à l&apos;accueil</Link>
        </footer>
      </div>
    </>
  )
}
