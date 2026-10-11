// Bilan parodontal imprimable — à remettre au patient avec le devis de
// surfaçage, ou à envoyer au correspondant.
//
// Le document montre d'abord l'ÉVOLUTION quand un relevé précédent existe :
// c'est elle qui fait comprendre au patient que le traitement sert à quelque
// chose, et c'est elle qui fait accepter la suite.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { LABO_FONCTION } from '@/lib/labo-server'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { BilanDocument } from './BilanDocument'
import type { PerioTeeth } from '@/lib/perio'

export const dynamic = 'force-dynamic'

export default async function BilanPerioPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, ${COLONNES_EN_TETE}`).eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, LABO_FONCTION)) redirect('/appointments')

  const { data: releve } = await supabase
    .from('perio_charts')
    .select('*, patient:patients(first_name, last_name)')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!releve) notFound()

  // Le relevé qui précède, s'il existe : c'est lui qui donne l'évolution.
  const { data: avant } = await supabase
    .from('perio_charts')
    .select('charted_at, teeth')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', releve.patient_id)
    .lt('charted_at', releve.charted_at)
    .order('charted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)
  const patient = (Array.isArray(releve.patient) ? releve.patient[0] : releve.patient) as
    { first_name?: string; last_name?: string } | null

  return (
    <BilanDocument
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      ville={doctor.city ?? null}
      patientId={releve.patient_id as string}
      patientNom={patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() : ''}
      date={releve.charted_at as string}
      teeth={(releve.teeth ?? {}) as PerioTeeth}
      plaque={releve.plaque_index as number | null}
      notes={(releve.notes as string | null) ?? null}
      dateAvant={(avant?.charted_at as string | undefined) ?? null}
      teethAvant={(avant?.teeth ?? null) as PerioTeeth | null}
    />
  )
}
