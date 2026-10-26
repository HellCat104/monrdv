// Compte rendu d'endoscopie — la forme définitive : lisible, imprimable,
// exportable en PDF par l'impression du navigateur (comme l'ordonnance et le
// certificat, pour que les documents du cabinet se ressemblent).
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor } from '@/types'
import type { Endoscopie } from '@/types'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { assemblerCompteRendu } from '@/lib/gastro'
import DocumentGastro from '@/components/gastro/DocumentGastro'

export const dynamic = 'force-dynamic'

export default async function PageCompteRendu({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, specialty, specialties, ${COLONNES_EN_TETE}`)
    .eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')

  const specialites = (doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : [])
  if (!isGastroDoctor(specialites)) redirect('/appointments')

  // `eq('doctor_id')` en plus de la RLS : la défense en profondeur coûte ici
  // une clause, et elle rend la requête juste même si une politique change.
  const { data: cr } = await supabase
    .from('endoscopies')
    .select('*, patient:patients(first_name, last_name, age, cin)')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!cr) notFound()

  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)
  const { titre, blocs } = assemblerCompteRendu(cr as unknown as Endoscopie)
  const p = cr.patient as unknown as { first_name: string; last_name: string; age?: number | null; cin?: string | null } | null
  const identite = p
    ? `${p.first_name} ${p.last_name}${p.age != null ? `, ${p.age} ans` : ''}${p.cin ? `, CIN ${p.cin}` : ''}`
    : 'Patient'

  return (
    <DocumentGastro
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      titre={titre}
      ville={doctor.city}
      date={cr.date_examen}
      patient={identite}
      blocs={blocs}
      brouillon={cr.statut !== 'valide'}
      backHref={`/patients/${cr.patient_id}`}
    />
  )
}
