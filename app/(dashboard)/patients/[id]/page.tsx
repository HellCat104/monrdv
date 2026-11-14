// Dossier patient — pleine page, en onglets.
// Forfait Agenda : fiche minimale (nom, prénom, téléphone, notes) sans données de santé.
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { allVitalDefs, resolveEnabledVitals, isGeneralDoctor, type VitalDef, specialitesDu } from '@/types'
import { canAccess } from '@/lib/plan'
import PatientDossier from '@/components/dashboard/PatientDossier'
import ResumePatient from '@/components/dashboard/ResumePatient'
import { preparerUn } from '@/lib/preparation-serveur'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
import PatientDossierLite from '@/components/dashboard/PatientDossierLite'
import { logAccesDossier } from '@/lib/audit'
import { isDentalDoctor } from '@/lib/dental'
import { rdvDuJour } from '@/lib/espace-dentaire'
import BarreModes from '@/components/dentaire/BarreModes'

export const dynamic = 'force-dynamic'

export default async function PatientDossierPage({ params, searchParams }: { params: { id: string }; searchParams: { visite?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, slug, specialty, specialties, enabled_vitals, custom_vitals, plan, inpe')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  // Forfait Agenda : fiche contact réduite, aucun accès au dossier médical
  if (!canAccess(doctor.plan, 'records')) {
    return <PatientDossierLite initialPatient={patient} />
  }

  // Le dossier médical va s'afficher : c'est le moment de le consigner.
  await logAccesDossier({
    doctorId: doctor.id, actorUserId: user.id, actorRole: 'medecin',
    actorEmail: user.email, action: 'dossier_consulte', patientId: patient.id,
  })

  const specialties = (specialitesDu(doctor)).filter(Boolean)
  const vitalDefsAll: VitalDef[] = allVitalDefs((doctor.custom_vitals as VitalDef[] | null) ?? [])
  const enabledVitals = resolveEnabledVitals(doctor.enabled_vitals, doctor.specialty)

  // Le résumé, calculé ICI et non dans le composant client : il demande cinq
  // lectures, et un dossier qui attend cinq allers-retours depuis le
  // navigateur s'ouvre une seconde plus tard. Il rend null si le dossier n'a
  // rien à résumer.
  //
  // Réservé au généraliste pour l'instant : ses règles sont celles de la
  // médecine générale, et chez un dentiste la moitié des constats ne le
  // concernent pas. Le jour où chaque branche a les siennes, le garde-fou
  // saute — il est ici, en un seul endroit.
  const preparation = isGeneralDoctor(specialties)
    ? await preparerUn(supabase, doctor.id, patient.id, format(getNowInMaroc(), 'yyyy-MM-dd'))
    : null

  // ── DENTISTE : UN DOSSIER, DEUX MODES ───────────────────────────────────
  // Le rendez-vous du jour ouvre le mode Consultation depuis le dossier. Une
  // seule petite lecture : les rendez-vous de CE patient, AUJOURD'HUI.
  let barreModes = null
  if (isDentalDoctor(specialties)) {
    const aujourdhui = format(getNowInMaroc(), 'yyyy-MM-dd')
    const { data: rdvs } = await supabase.from('appointments')
      .select('id, date, time, status, queue_status')
      .eq('doctor_id', doctor.id).eq('patient_id', patient.id).eq('date', aujourdhui)
    const rdv = rdvDuJour((rdvs ?? []) as Parameters<typeof rdvDuJour>[0], aujourdhui)
    barreModes = <BarreModes patientId={patient.id} mode="dossier" rdv={rdv ? { id: rdv.id, time: rdv.time } : null} />
  }

  return (
    <PatientDossier
      barreModes={barreModes}
      visiteTerminee={typeof searchParams.visite === 'string' ? searchParams.visite : null}
      doctorId={doctor.id}
      doctorName={doctor.name ?? ''}
      doctorSlug={doctor.slug ?? ''}
      specialties={specialties}
      enabledVitals={enabledVitals}
      vitalDefsAll={vitalDefsAll}
      initialPatient={patient}
      doctorInpe={doctor.inpe ?? null}
      // Pour n'offrir « Facture » que si le forfait la porte : le lien
      // conduirait sinon à une redirection muette.
      facturation={canAccess(doctor.plan, 'invoicing')}
      // Passé en prop plutôt que posé au-dessus du dossier : le composant le
      // place sous le nom du patient, et retire son propre encadré d'allergies
      // puisque le résumé le porte déjà.
      resume={preparation ? <ResumePatient preparation={preparation} /> : null}
    />
  )
}
