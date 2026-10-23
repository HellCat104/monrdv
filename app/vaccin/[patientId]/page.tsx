// Enregistrer un vaccin administré, et remettre le certificat (branche
// généraliste). La trace reste au cabinet, le papier part avec le patient.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { ageFromBirthDate } from '@/lib/utils'
import { COLONNES_EN_TETE } from '@/lib/document-entete'
import { tableAbsente } from '@/lib/migrations'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import VaccinClient from './VaccinClient'

function safeBack(back?: string): string {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return '/patients'
}

export const dynamic = 'force-dynamic'

export default async function VaccinPage({ params, searchParams }: {
  params: { patientId: string }
  searchParams: { back?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select(`id, plan, ${COLONNES_EN_TETE}`)
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()
  // Acte médical : réservé au Cabinet complet, comme les ordonnances.
  if (!canAccess(doctor.plan, 'prescriptions')) redirect('/appointments')

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, birth_date, cin')
    .eq('id', params.patientId)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  // Les vaccins déjà administrés ICI. Migration v79 absente : la liste est
  // vide, l'écran fonctionne, rien ne tombe en erreur.
  const { data: faits, error } = await supabase
    .from('vaccinations')
    .select('id, libelle, administre_le, lot, dose, rappel_le')
    .eq('patient_id', patient.id)
    .order('administre_le', { ascending: false })

  return (
    <VaccinClient
      doctor={doctor}
      doctorId={doctor.id}
      patient={{ ...patient, age: ageFromBirthDate(patient.birth_date) ?? patient.age }}
      historique={tableAbsente(error?.code) ? [] : (faits ?? [])}
      v79={!tableAbsente(error?.code)}
      backHref={safeBack(searchParams.back)}
      logoUrl={await getCabinetLogoUrl(supabase, doctor.id)}
    />
  )
}
