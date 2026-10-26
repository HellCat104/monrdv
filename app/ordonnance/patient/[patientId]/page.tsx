// Nouvelle ordonnance créée directement depuis la fiche patient (sans passer
// par un RDV). La prescription n'est liée à aucun rendez-vous (appointment_id null).
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { getOrdonnanceAReprendre, getRecentPrescriptionLines } from '@/lib/ordonnance'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE } from '@/lib/document-entete'
import { OrdonnanceEditor } from '../../[id]/OrdonnanceEditor'
import { isGastroDoctor, type LigneOrdonnance } from '@/types'
import { rendreModele } from '@/lib/gastro'
import { format } from 'date-fns'

// N'accepte qu'un chemin interne (évite les redirections ouvertes)
function safeBack(back?: string): string | undefined {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return undefined
}

interface Props {
  params: { patientId: string }
  searchParams: { back?: string; reprendre?: string }
}

export const dynamic = 'force-dynamic'

export default async function OrdonnancePatientPage({ params, searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select(`id, prescription_favorites, plan, specialty, specialties, ${COLONNES_EN_TETE}`)
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()
  // Ordonnances réservées au forfait Cabinet complet
  if (!canAccess(doctor.plan, 'prescriptions')) redirect('/appointments')

  // Le patient doit appartenir au médecin
  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, allergies')
    .eq('id', params.patientId)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  const favorites = ((doctor.prescription_favorites as string[] | null) ?? []).filter((f) => typeof f === 'string')
  // Logo lu à part de la fiche : sans la migration v57, pas de logo, pas de 404.
  const [recentLines, logoUrl, reprise] = await Promise.all([
    getRecentPrescriptionLines(supabase, doctor.id, favorites),
    getCabinetLogoUrl(supabase, doctor.id),
    // ?reprendre=<id> → renouvellement depuis la fiche patient, hors RDV
    getOrdonnanceAReprendre(supabase, doctor.id, patient.id, searchParams.reprendre),
  ])

  // Les modèles d'ordonnance ne concernent que la branche gastro pour
  // l'instant : les charger ailleurs afficherait un panneau vide chez tout le
  // monde, et une requête de plus à chaque ouverture.
  const specialites = (doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : [])
  let modeles: { id: string; nom: string; categorie: string | null; texte: string }[] = []
  if (isGastroDoctor(specialites)) {
    const { data } = await supabase
      .from('prescription_templates').select('id, nom, categorie, lignes, examens, notes')
      .is('archive_le', null).order('categorie').order('nom')
    modeles = (data ?? []).map((m) => ({
      id: m.id, nom: m.nom, categorie: m.categorie,
      texte: rendreModele((m.lignes ?? []) as LigneOrdonnance[], m.examens, m.notes),
    })).filter((m) => m.texte.trim())
  }

  return (
    <OrdonnanceEditor
      modeles={modeles}
      doctor={doctor}
      patient={patient}
      appointmentId={null}
      appointmentDate={format(new Date(), 'yyyy-MM-dd')}
      existingId={null}
      existingContent={reprise?.content ?? ''}
      repriseDu={reprise?.created_at ?? null}
      favorites={favorites}
      recentLines={recentLines}
      backHref={safeBack(searchParams.back)}
      logoUrl={logoUrl}
    />
  )
}
