// Compte rendu de consultation — imprimable, exportable en PDF par
// l'impression du navigateur. Mêmes en-tête et mise en page que les autres
// documents du cabinet.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor } from '@/types'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { RUBRIQUES_CONSULTATION } from '@/lib/gastro'
import { formatDateFr } from '@/lib/utils'
import DocumentGastro from '@/components/gastro/DocumentGastro'

export const dynamic = 'force-dynamic'

export default async function PageCrConsultation({ params }: { params: { id: string } }) {
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

  const { data: c } = await supabase
    .from('consultations')
    .select('*, patient:patients(first_name, last_name, age, cin)')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!c) notFound()

  // Seules les rubriques REMPLIES sont imprimées, dans l'ordre de l'écran.
  // Une rubrique vide n'est pas une rubrique normale : c'est une rubrique
  // qu'on n'a pas renseignée, et le document ne doit pas trancher.
  const blocs = RUBRIQUES_CONSULTATION
    .map((r) => ({ titre: r.label, texte: String((c as Record<string, unknown>)[r.cle] ?? '').trim() }))
    .filter((b) => b.texte)
  if (c.prochain_controle) {
    blocs.push({ titre: 'Prochain contrôle', texte: `Prévu le ${formatDateFr(c.prochain_controle)}.` })
  }

  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)
  const p = c.patient as unknown as { first_name: string; last_name: string; age?: number | null; cin?: string | null } | null
  const identite = p
    ? `${p.first_name} ${p.last_name}${p.age != null ? `, ${p.age} ans` : ''}${p.cin ? `, CIN ${p.cin}` : ''}`
    : 'Patient'

  return (
    <DocumentGastro
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      titre="Compte rendu de consultation"
      ville={doctor.city}
      date={c.date_consultation}
      patient={identite}
      blocs={blocs}
      brouillon={c.statut !== 'validee'}
      backHref={`/patients/${c.patient_id}`}
    />
  )
}
