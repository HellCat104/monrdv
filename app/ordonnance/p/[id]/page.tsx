// Ordonnance imprimable par identifiant d'ORDONNANCE (hors rendez-vous —
// renouvellements depuis la fiche patient). Réservée au médecin propriétaire.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRecentPrescriptionLines } from '@/lib/ordonnance'
import { OrdonnanceEditor } from '../../[id]/OrdonnanceEditor'

export const dynamic = 'force-dynamic'

// N'accepte qu'un chemin interne (évite les redirections ouvertes)
function safeBack(back?: string): string {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return '/patients'
}

export default async function OrdonnanceByIdPage({ params, searchParams }: { params: { id: string }; searchParams: { back?: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, ice, inpe, cnom_number, prescription_favorites')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  const { data: prescription } = await supabase
    .from('prescriptions')
    .select('id, content, created_at, appointment_id, patient:patients(id, first_name, last_name, age, allergies)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!prescription || !prescription.patient) notFound()

  const patient = Array.isArray(prescription.patient) ? prescription.patient[0] : prescription.patient
  const favorites = ((doctor.prescription_favorites as string[] | null) ?? []).filter((f) => typeof f === 'string')
  const recentLines = await getRecentPrescriptionLines(supabase, doctor.id, favorites)

  return (
    <OrdonnanceEditor
      doctor={doctor}
      patient={patient}
      appointmentId={prescription.appointment_id ?? null}
      appointmentDate={prescription.created_at}
      existingId={prescription.id}
      existingContent={prescription.content}
      favorites={favorites}
      recentLines={recentLines}
      backHref={safeBack(searchParams.back)}
    />
  )
}
