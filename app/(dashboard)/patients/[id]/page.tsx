// Dossier patient — pleine page, 3 colonnes (identité / historique / suivi).
// Forfait Agenda : fiche minimale (nom, prénom, téléphone, notes) sans données de santé.
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { allVitalDefs, resolveEnabledVitals, type VitalDef } from '@/types'
import { canAccess } from '@/lib/plan'
import PatientDossier from '@/components/dashboard/PatientDossier'
import PatientDossierLite from '@/components/dashboard/PatientDossierLite'
import { logAccesDossier } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export default async function PatientDossierPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, slug, specialty, specialties, enabled_vitals, custom_vitals, plan')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  // Forfait Agenda : fiche contact réduite, aucun accès au dossier médical
  if (!canAccess(doctor.plan, 'records')) {
    return <PatientDossierLite initialPatient={patient} />
  }

  // Le dossier médical va s'afficher : c'est le moment de le consigner.
  await logAccesDossier({
    doctorId: doctor.id, actorUserId: user.id, actorRole: 'medecin',
    actorEmail: user.email, action: 'dossier_consulte', patientId: patient.id,
  })

  const specialties = ((doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : [])).filter(Boolean)
  const vitalDefsAll: VitalDef[] = allVitalDefs((doctor.custom_vitals as VitalDef[] | null) ?? [])
  const enabledVitals = resolveEnabledVitals(doctor.enabled_vitals, doctor.specialty)

  return (
    <PatientDossier
      doctorId={doctor.id}
      doctorName={doctor.name ?? ''}
      doctorSlug={doctor.slug ?? ''}
      specialties={specialties}
      enabledVitals={enabledVitals}
      vitalDefsAll={vitalDefsAll}
      initialPatient={patient}
    />
  )
}
