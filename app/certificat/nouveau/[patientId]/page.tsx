// Nouveau certificat sur une page dédiée (revient d'où on vient via ?back).
// Évite de renvoyer le médecin dans la fiche/agenda pendant une consultation.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { ageFromBirthDate } from '@/lib/utils'
import { isGeneralDoctor, specialitesDu } from '@/types'
import { blocResumeMedical, texteConstantes } from '@/lib/resume-medical'
import NewCertificate from './NewCertificate'
import { FAMILLES_DOCUMENT, type FamilleDocument } from '@/lib/certificats'

export const dynamic = 'force-dynamic'

function safeBack(back?: string): string {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return '/patients'
}

/** La famille vient de l'URL (le médecin a cliqué « Courrier », « Certificat »
 *  ou « Demande d'examen » dans le menu Documents). On ne fait confiance qu'aux
 *  valeurs connues : une famille inventée afficherait une liste vide. */
function safeFamille(f?: string): FamilleDocument | undefined {
  return FAMILLES_DOCUMENT.includes(f as FamilleDocument) ? (f as FamilleDocument) : undefined
}

export default async function NewCertificatePage({ params, searchParams }: { params: { patientId: string }; searchParams: { back?: string; apt?: string; famille?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase.from('doctors').select('id, name, plan, specialty, specialties').eq('email', user.email).single()
  if (!doctor) notFound()
  // Certificats réservés au forfait Cabinet complet
  if (!canAccess(doctor.plan, 'prescriptions')) redirect('/appointments')

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, birth_date, cin, parent1_name, parent2_name, allergies, chronic_conditions, surgeries, current_treatments, conditions, vaccinations')
    .eq('id', params.patientId)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  // Âge réel dérivé de la date de naissance (l'âge stocké peut être périmé)
  const certPatient = { ...patient, age: ageFromBirthDate(patient.birth_date) ?? patient.age }

  // Le RDV passé en paramètre doit appartenir à CE patient (et à ce médecin),
  // sinon on rattacherait le certificat au dossier d'un autre patient.
  let safeApt: string | null = null
  if (searchParams.apt) {
    const { data: apt } = await supabase
      .from('appointments').select('id')
      .eq('id', searchParams.apt).eq('doctor_id', doctor.id).eq('patient_id', patient.id)
      .maybeSingle()
    safeApt = apt?.id ?? null
  }

  // Le résumé du dossier, pour que les courriers au confrère ne partent pas
  // d'une page blanche. Réservé aux GÉNÉRALISTES : c'est la branche sur
  // laquelle nous travaillons, et les autres spécialités n'ont pas demandé ça.
  // Pour l'ouvrir au pédiatre ou au dentiste, il suffira d'élargir ce test.
  const famille = safeFamille(searchParams.famille)
  const specialites = specialitesDu(doctor)
  let resume = ''
  if (famille === 'courrier' && isGeneralDoctor(specialites)) {
    const [notes, ordos, constantes] = await Promise.all([
      supabase.from('consultation_notes').select('note, created_at')
        .eq('doctor_id', doctor.id).eq('patient_id', patient.id)
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('prescriptions').select('content, created_at')
        .eq('doctor_id', doctor.id).eq('patient_id', patient.id)
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('vital_signs').select('values, measured_at')
        .eq('doctor_id', doctor.id).eq('patient_id', patient.id)
        .order('measured_at', { ascending: false }).limit(1),
    ])
    const note = notes.data?.[0]
    const ordo = ordos.data?.[0]
    const cst = constantes.data?.[0]
    const texteCst = texteConstantes(cst?.values as Record<string, number> | undefined)
    resume = blocResumeMedical({
      allergies: patient.allergies,
      chronic_conditions: patient.chronic_conditions,
      surgeries: patient.surgeries,
      current_treatments: patient.current_treatments,
      conditions: patient.conditions as string[] | null,
      vaccins: patient.vaccinations,
      derniereNote: note?.note ? { date: note.created_at, texte: note.note } : null,
      derniereOrdonnance: ordo?.content ? { date: ordo.created_at, contenu: ordo.content } : null,
      dernieresConstantes: texteCst ? { date: cst!.measured_at, texte: texteCst } : null,
    })
  }

  return (
    <NewCertificate
      doctorId={doctor.id}
      doctorName={doctor.name}
      patient={certPatient}
      appointmentId={safeApt}
      backHref={safeBack(searchParams.back)}
      famille={famille}
      resume={resume}
    />
  )
}
