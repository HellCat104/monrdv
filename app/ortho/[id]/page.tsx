// Fiche de traitement orthodontique imprimable.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { LABO_FONCTION } from '@/lib/labo-server'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { getNowInMaroc } from '@/lib/utils'
import { FicheDocument } from './FicheDocument'
import type { OrthoTraitement } from '@/lib/ortho'

export const dynamic = 'force-dynamic'

export default async function FicheOrthoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, ${COLONNES_EN_TETE}`).eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, LABO_FONCTION)) redirect('/appointments')

  const { data: traitement } = await supabase
    .from('ortho_treatments')
    .select('*, visits:ortho_visits(id, visit_date, act, wire, next_visit, notes), patient:patients(first_name, last_name)')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!traitement) notFound()

  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)
  const patient = (Array.isArray(traitement.patient) ? traitement.patient[0] : traitement.patient) as
    { first_name?: string; last_name?: string } | null

  return (
    <FicheDocument
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      ville={doctor.city ?? null}
      patientNom={patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() : ''}
      traitement={traitement as unknown as OrthoTraitement}
      aujourdhui={getNowInMaroc().toISOString().slice(0, 10)}
    />
  )
}
