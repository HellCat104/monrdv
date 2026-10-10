// Feuille de soins imprimable.
//
// ACCÈS : le médecin propriétaire, forfait Cabinet complet. Comme tous les
// documents imprimables de l'application, elle ne s'ouvre pas depuis l'espace
// secrétaire : la feuille porte une attestation signée du praticien.
//
// Les données sont celles ENREGISTRÉES SUR LA FEUILLE (organisme, assuré,
// immatriculation), pas celles de la fiche patient aujourd'hui : rouvrir une
// feuille de mars ne doit pas la réécrire avec la couverture d'octobre.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { FEUILLE_FONCTION } from '@/lib/feuilles-soins-server'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { FeuilleDocument, type LigneSoin } from './FeuilleDocument'

export const dynamic = 'force-dynamic'

export default async function FeuilleSoinsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, ${COLONNES_EN_TETE}`).eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, FEUILLE_FONCTION)) redirect('/appointments')

  const { data: feuille } = await supabase
    .from('care_sheets')
    .select('*, items:care_sheet_items(tooth, code, label, amount, position), patient:patients(first_name, last_name, cin)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .maybeSingle()
  if (!feuille) notFound()

  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)
  const patient = (Array.isArray(feuille.patient) ? feuille.patient[0] : feuille.patient) as
    { first_name?: string; last_name?: string; cin?: string | null } | null

  return (
    <FeuilleDocument
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      ville={doctor.city ?? null}
      patientId={feuille.patient_id as string}
      patientNom={patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() : ''}
      patientCin={patient?.cin ?? null}
      organisme={(feuille.insurer as string | null) ?? null}
      assureNom={(feuille.insured_name as string | null) ?? null}
      assureNumero={(feuille.insured_number as string | null) ?? null}
      assureLien={(feuille.insured_relation as string | null) ?? null}
      dateSoins={feuille.care_date as string}
      items={(feuille.items ?? []) as LigneSoin[]}
    />
  )
}
