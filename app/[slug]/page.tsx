// Page publique de réservation — accessible via /dr-hassan ou /slug-medecin
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BookingPageClient } from './BookingPageClient'
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
    .single()

  if (!doctor) return { title: 'Médecin introuvable' }

  return {
    title: `RDV avec Dr. ${doctor.name} — MonRDV`,
    description: `Prenez rendez-vous en ligne avec Dr. ${doctor.name}, ${doctor.specialty}.`,
  }
}

export default async function BookingPage({ params }: Props) {
  const supabase = createClient()
  // Supporte /dr-hassan ou /hassan
  const slug = params.slug.replace(/^dr-/, '')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'approved')
    .single()

  if (!doctor) notFound()

  return <BookingPageClient doctor={doctor} />
}
