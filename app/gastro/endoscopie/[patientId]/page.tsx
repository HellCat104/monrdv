// Compte rendu d'endoscopie — saisie. BRANCHE GASTRO-ENTÉROLOGIE.
//
// Le contrôle d'accès est ici, côté serveur, et il est double : le forfait
// (Cabinet complet) et la branche (gastro-entérologie). Masquer un lien dans
// le menu n'empêche personne de taper l'adresse.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor, specialitesDu } from '@/types'
import type { TypeEndoscopie } from '@/types'
import EndoscopieClient from './EndoscopieClient'

export const dynamic = 'force-dynamic'

export default async function PageEndoscopie({
  params, searchParams,
}: {
  params: { patientId: string }
  searchParams: { type?: string; apt?: string; id?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select('id, name, plan, specialty, specialties')
    .eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')

  const specialites = specialitesDu(doctor)
  if (!isGastroDoctor(specialites)) redirect('/appointments')

  const { data: patient } = await supabase
    .from('patients').select('id, first_name, last_name, age, cin')
    .eq('id', params.patientId).eq('doctor_id', doctor.id).single()
  if (!patient) notFound()

  // Le rendez-vous doit appartenir à CE patient : sans cette vérification, un
  // compte rendu pourrait être rattaché au rendez-vous de quelqu'un d'autre.
  let aptId: string | null = null
  if (searchParams.apt) {
    const { data: apt } = await supabase.from('appointments').select('id')
      .eq('id', searchParams.apt).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    aptId = apt?.id ?? null
  }

  // Reprise d'un brouillon. Un compte rendu validé n'est pas rouvert ici : il
  // se relit sur sa page d'impression, qui est sa forme définitive.
  let existant = null
  if (searchParams.id) {
    const { data } = await supabase.from('endoscopies').select('*')
      .eq('id', searchParams.id).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    if (data && data.statut === 'valide') redirect(`/gastro/cr/${data.id}`)
    existant = data
  }

  const type: TypeEndoscopie = searchParams.type === 'coloscopie' ? 'coloscopie' : 'gastroscopie'

  return (
    <EndoscopieClient
      doctorId={doctor.id}
      patient={patient}
      appointmentId={aptId}
      typeInitial={(existant?.type_examen as TypeEndoscopie) ?? type}
      existant={existant}
    />
  )
}
