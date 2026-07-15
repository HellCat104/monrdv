// Dossier patient — pleine page, 3 colonnes (identité / historique / suivi).
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { allVitalDefs, resolveEnabledVitals, type VitalDef } from '@/types'
import PatientDossier from '@/components/dashboard/PatientDossier'

export const dynamic = 'force-dynamic'

export default async function PatientDossierPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, slug, specialty, specialties, enabled_vitals, custom_vitals')
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
