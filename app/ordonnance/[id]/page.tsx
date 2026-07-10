// Ordonnance imprimable liée à un rendez-vous.
// Accessible uniquement par le médecin propriétaire du RDV.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRecentPrescriptionLines } from '@/lib/ordonnance'
import { OrdonnanceEditor } from './OrdonnanceEditor'

interface Props {
  params: { id: string }
}

export const dynamic = 'force-dynamic'

export default async function OrdonnancePage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, ice, inpe, prescription_favorites')
    .eq('email', user.email)
    .single()

  if (!doctor) notFound()

  // RDV + patient (revérifie l'appartenance au médecin)
  const { data: apt } = await supabase
    .from('appointments')
    .select('id, date, patient:patients(id, first_name, last_name, age, allergies)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()

  if (!apt || !apt.patient) notFound()

  const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient

  // Ordonnance existante pour ce RDV (édition) — la plus récente
  const { data: existing } = await supabase
    .from('prescriptions')
    .select('id, content')
    .eq('appointment_id', apt.id)
    .eq('doctor_id', doctor.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const favorites = ((doctor.prescription_favorites as string[] | null) ?? []).filter((f) => typeof f === 'string')
  const recentLines = await getRecentPrescriptionLines(supabase, doctor.id, favorites)

  return (
    <OrdonnanceEditor
      doctor={doctor}
      patient={patient}
      appointmentId={apt.id}
      appointmentDate={apt.date}
      existingId={existing?.id ?? null}
      existingContent={existing?.content ?? ''}
      favorites={favorites}
      recentLines={recentLines}
    />
  )
}
