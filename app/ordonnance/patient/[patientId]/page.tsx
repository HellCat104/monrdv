// Nouvelle ordonnance créée directement depuis la fiche patient (sans passer
// par un RDV). La prescription n'est liée à aucun rendez-vous (appointment_id null).
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRecentPrescriptionLines } from '@/lib/ordonnance'
import { OrdonnanceEditor } from '../../[id]/OrdonnanceEditor'
import { format } from 'date-fns'

// N'accepte qu'un chemin interne (évite les redirections ouvertes)
function safeBack(back?: string): string | undefined {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return undefined
}

interface Props {
  params: { patientId: string }
  searchParams: { back?: string }
}

export const dynamic = 'force-dynamic'

export default async function OrdonnancePatientPage({ params, searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, ice, inpe, cnom_number, prescription_favorites')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  // Le patient doit appartenir au médecin
  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, allergies')
    .eq('id', params.patientId)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  const favorites = ((doctor.prescription_favorites as string[] | null) ?? []).filter((f) => typeof f === 'string')
  const recentLines = await getRecentPrescriptionLines(supabase, doctor.id, favorites)

  return (
    <OrdonnanceEditor
      doctor={doctor}
      patient={patient}
      appointmentId={null}
      appointmentDate={format(new Date(), 'yyyy-MM-dd')}
      existingId={null}
      existingContent=""
      favorites={favorites}
      recentLines={recentLines}
      backHref={safeBack(searchParams.back)}
    />
  )
}
