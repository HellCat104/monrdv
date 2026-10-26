// Fiche de préparation à la coloscopie — BRANCHE GASTRO-ENTÉROLOGIE.
//
// Le médecin choisit l'un de SES protocoles, l'adapte à ce patient, l'imprime
// et le range au dossier. MonRDV ne propose aucun protocole : il n'en connaît
// aucun, et en inventer un reviendrait à prescrire.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor } from '@/types'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import PreparationClient from './PreparationClient'

export const dynamic = 'force-dynamic'

export default async function PagePreparation({
  params, searchParams,
}: {
  params: { patientId: string }
  searchParams: { apt?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, specialty, specialties, ${COLONNES_EN_TETE}`).eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')

  const specialites = (doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : [])
  if (!isGastroDoctor(specialites)) redirect('/appointments')

  const { data: patient } = await supabase
    .from('patients').select('id, first_name, last_name, age')
    .eq('id', params.patientId).eq('doctor_id', doctor.id).single()
  if (!patient) notFound()

  // Le rendez-vous d'endoscopie, s'il y en a un : c'est son heure qui cale les
  // horaires de prise, et c'est à lui que la fiche se rattache.
  let rdv: { id: string; date: string; time: string } | null = null
  if (searchParams.apt) {
    const { data } = await supabase.from('appointments').select('id, date, time')
      .eq('id', searchParams.apt).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    rdv = data as typeof rdv
  }

  const { data: protocoles } = await supabase
    .from('preparation_protocols').select('*').is('archive_le', null).order('nom')

  // L'en-tête du cabinet est sur la feuille remise au patient : c'est par là
  // qu'il appelle si la préparation se passe mal, et c'est le seul numéro
  // qu'il aura sous les yeux à 22 h.
  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)

  return (
    <PreparationClient
      doctorId={doctor.id}
      patient={patient}
      rdv={rdv}
      protocoles={protocoles ?? []}
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
    />
  )
}
