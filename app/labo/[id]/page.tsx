// Bon de travail imprimable. Médecin propriétaire, forfait Cabinet complet —
// comme tous les documents imprimables de l'application.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { LABO_FONCTION } from '@/lib/labo-server'
import { nomSurBon } from '@/lib/labo'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { BonDocument } from './BonDocument'

export const dynamic = 'force-dynamic'

export default async function BonLaboPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // `lab_slip_naming` lu à part de l'en-tête : sans la migration v68, le bon
  // s'imprime avec les initiales plutôt que de tomber en 404.
  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, ${COLONNES_EN_TETE}`).eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, LABO_FONCTION)) redirect('/appointments')

  const { data: reglage } = await supabase
    .from('doctors').select('lab_slip_naming').eq('id', doctor.id).maybeSingle()

  const { data: travail } = await supabase
    .from('lab_works')
    .select('*, patient:patients(first_name, last_name), appointment:appointments(date)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .maybeSingle()
  if (!travail) notFound()

  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)
  const patient = (Array.isArray(travail.patient) ? travail.patient[0] : travail.patient) as
    { first_name?: string; last_name?: string } | null
  const rdv = (Array.isArray(travail.appointment) ? travail.appointment[0] : travail.appointment) as
    { date?: string } | null

  return (
    <BonDocument
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      patientId={travail.patient_id as string}
      patientAffiche={nomSurBon(
        patient?.first_name, patient?.last_name,
        (reglage?.lab_slip_naming as 'initiales' | 'complet' | undefined) ?? 'initiales',
      )}
      type={(travail.work_type as string | null) ?? null}
      dents={(travail.teeth as string[] | null) ?? []}
      labo={(travail.lab_name as string | null) ?? null}
      teinte={(travail.shade as string | null) ?? null}
      matiere={(travail.material as string | null) ?? null}
      instructions={(travail.instructions as string | null) ?? null}
      envoye={(travail.sent_at as string | null) ?? null}
      retour={(travail.due_at as string | null) ?? null}
      pose={rdv?.date ?? null}
    />
  )
}
