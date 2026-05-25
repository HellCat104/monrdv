// Page publique de réservation — accessible via /dr-hassan ou /slug-medecin
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BookingPageClient } from './BookingPageClient'
import Link from 'next/link'
import type { Metadata } from 'next'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const slug = params.slug.replace('dr-', '')
  const { data: doctor } = await supabase
    .from('doctors')
    .select('name, specialty')
    .eq('slug', slug)
    .eq('status', 'approved')
    .single()

  if (!doctor) return { title: 'Médecin introuvable' }

  return {
    title: `RDV avec Dr. ${doctor.name} — MonRDV`,
    description: `Prenez rendez-vous en ligne avec Dr. ${doctor.name}, ${doctor.specialty}.`,
  }
}

export default async function BookingPage({ params }: Props) {
  const supabase = createClient()
  const slug = params.slug.replace(/^dr-/, '')

  // Vérifie si le médecin existe (approuvé)
  const { data: doctor } = await supabase
    .from('doctors')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'approved')
    .single()

  // Médecin introuvable → 404
  if (!doctor) notFound()

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

  return <BookingPageClient doctor={doctor} />
}
