// Nouveau certificat sur une page dédiée (revient d'où on vient via ?back).
// Évite de renvoyer le médecin dans la fiche/agenda pendant une consultation.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ageFromBirthDate } from '@/lib/utils'
import NewCertificate from './NewCertificate'

export const dynamic = 'force-dynamic'

function safeBack(back?: string): string {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return '/patients'
}

export default async function NewCertificatePage({ params, searchParams }: { params: { patientId: string }; searchParams: { back?: string; apt?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase.from('doctors').select('id, name').eq('email', user.email).single()
  if (!doctor) notFound()

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, birth_date, cin')
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

  return (
    <NewCertificate
      doctorId={doctor.id}
      doctorName={doctor.name}
      patient={certPatient}
      appointmentId={safeApt}
      backHref={safeBack(searchParams.back)}
    />
  )
}
