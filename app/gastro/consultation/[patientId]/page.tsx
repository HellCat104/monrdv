// Consultation structurée — BRANCHE GASTRO-ENTÉROLOGIE.
//
// Le dossier du patient est LU ICI et passé à l'écran : antécédents, allergies,
// traitements, dernières constantes. Le médecin ne les retape pas, il les
// amende — c'est la différence entre une fiche qui aide et une fiche qui fait
// double emploi. Rien n'est écrit à sa place : ce qui arrive pré-rempli vient
// du dossier, pas d'une déduction.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor, VITAL_DEFS } from '@/types'
import { formatDateFr } from '@/lib/utils'
import ConsultationClient from './ConsultationClient'

export const dynamic = 'force-dynamic'

export default async function PageConsultation({
  params, searchParams,
}: {
  params: { patientId: string }
  searchParams: { apt?: string; id?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select('id, name, plan, specialty, specialties')
    .eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')

  const specialites = (doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : [])
  if (!isGastroDoctor(specialites)) redirect('/appointments')

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, cin, allergies, chronic_conditions, surgeries, current_treatments, family_history')
    .eq('id', params.patientId).eq('doctor_id', doctor.id).single()
  if (!patient) notFound()

  let aptId: string | null = null
  if (searchParams.apt) {
    const { data: apt } = await supabase.from('appointments').select('id')
      .eq('id', searchParams.apt).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    aptId = apt?.id ?? null
  }

  let existant = null
  if (searchParams.id) {
    const { data } = await supabase.from('consultations').select('*')
      .eq('id', searchParams.id).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    if (data && data.statut === 'validee') redirect(`/gastro/consultation/cr/${data.id}`)
    existant = data
  }

  // Dernières constantes : le poids compte ici plus qu'ailleurs — une perte de
  // poids est un signe d'alarme. On les propose, le médecin les corrige.
  // On lit les DEUX dernières : l'écart de poids est ce qui compte ici, et le
  // faire calculer de tête à chaque consultation revient à ne jamais le faire.
  const { data: cst } = await supabase.from('vital_signs')
    .select('values, measured_at').eq('doctor_id', doctor.id).eq('patient_id', patient.id)
    .order('measured_at', { ascending: false }).limit(2)
  const valeurs = (cst?.[0]?.values ?? null) as Record<string, number> | null
  const precedentes = (cst?.[1]?.values ?? null) as Record<string, number> | null
  const lignes = valeurs
    ? VITAL_DEFS.filter((d) => typeof valeurs[d.key] === 'number')
        .map((d) => {
          const base = `${d.label} : ${valeurs[d.key]} ${d.unit}`
          // L'écart est un simple report de deux mesures, pas une
          // interprétation : on ne qualifie pas la perte, on l'affiche.
          if (d.key !== 'weight' || typeof precedentes?.weight !== 'number' || !cst?.[1]) return base
          const delta = Math.round((valeurs.weight - precedentes.weight) * 10) / 10
          if (delta === 0) return `${base} (stable depuis le ${formatDateFr(cst[1].measured_at)})`
          return `${base} (${delta > 0 ? '+' : ''}${delta} kg depuis le ${formatDateFr(cst[1].measured_at)})`
        })
    : []
  const mesures = lignes.join('\n')

  const antecedents = [
    (patient.chronic_conditions ?? '').trim(),
    (patient.surgeries ?? '').trim() ? `Chirurgicaux : ${(patient.surgeries ?? '').trim()}` : '',
    (patient.current_treatments ?? '').trim() ? `Traitement en cours : ${(patient.current_treatments ?? '').trim()}` : '',
    (patient.family_history ?? '').trim() ? `Familiaux : ${(patient.family_history ?? '').trim()}` : '',
  ].filter(Boolean).join('\n')

  return (
    <ConsultationClient
      doctorId={doctor.id}
      patient={patient}
      appointmentId={aptId}
      existant={existant}
      dossier={{ antecedents, allergies: (patient.allergies ?? '').trim(), mesures }}
    />
  )
}
