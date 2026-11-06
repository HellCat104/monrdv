// Consultation structurée — BRANCHE MÉDECINE GÉNÉRALE.
//
// Même écran que la gastro-entérologie et la dentisterie (un seul composant
// partagé), avec les rubriques et les trames du généraliste. Ce qui diffère
// vraiment ici, c'est ce qui arrive PRÉ-REMPLI : le dossier est lu côté
// serveur et posé dans les rubriques du dossier (antécédents, allergies,
// constantes), et le RÉSUMÉ est affiché au-dessus, avant la première ligne.
//
// Le résumé n'est pas un décor : c'est lui qui porte « à vérifier
// aujourd'hui » — tension haute deux fois de suite, bilan qui date, rappel
// échu. Placé APRÈS l'examen clinique, il arriverait après la décision.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGeneralDoctor, VITAL_DEFS, specialitesDu } from '@/types'
import { formatDateFr, getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
import ConsultationStructuree from '@/components/consultation/ConsultationStructuree'
import ResumePatient from '@/components/dashboard/ResumePatient'
import { preparerUn } from '@/lib/preparation-serveur'
import { RUBRIQUES_GENERALISTE, TRAMES_GENERALISTE, COLONNES_FACULTATIVES_GENERALISTE } from '@/lib/generaliste'

export const dynamic = 'force-dynamic'

export default async function PageConsultationGeneraliste({
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
  if (!isGeneralDoctor(specialitesDu(doctor))) redirect('/appointments')

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
    if (data && data.statut === 'validee') redirect(`/generaliste/consultation/cr/${data.id}`)
    existant = data
  }

  // Dernières constantes, proposées et non imposées : le médecin les corrige
  // s'il remesure. Chez le généraliste c'est la TENSION qui compte le plus —
  // on affiche donc l'écart avec la prise précédente pour elle aussi, pas
  // seulement pour le poids.
  const { data: cst } = await supabase.from('vital_signs')
    .select('values, measured_at').eq('doctor_id', doctor.id).eq('patient_id', patient.id)
    .order('measured_at', { ascending: false }).limit(2)
  const valeurs = (cst?.[0]?.values ?? null) as Record<string, number> | null
  const precedentes = (cst?.[1]?.values ?? null) as Record<string, number> | null
  const lignes = valeurs
    ? VITAL_DEFS.filter((d) => typeof valeurs[d.key] === 'number')
        .map((d) => {
          const base = `${d.label} : ${valeurs[d.key]} ${d.unit}`
          // Un report de deux mesures, pas une interprétation : on affiche
          // l'écart, on ne le qualifie pas.
          const suivies = ['weight', 'systolic', 'diastolic']
          if (!suivies.includes(d.key) || typeof precedentes?.[d.key] !== 'number' || !cst?.[1]) return base
          const delta = Math.round((valeurs[d.key] - precedentes[d.key]) * 10) / 10
          if (delta === 0) return `${base} (stable depuis le ${formatDateFr(cst[1].measured_at)})`
          return `${base} (${delta > 0 ? '+' : ''}${delta} depuis le ${formatDateFr(cst[1].measured_at)})`
        })
    : []

  const antecedents = [
    (patient.chronic_conditions ?? '').trim(),
    (patient.surgeries ?? '').trim() ? `Chirurgicaux : ${(patient.surgeries ?? '').trim()}` : '',
    (patient.current_treatments ?? '').trim() ? `Traitement en cours : ${(patient.current_treatments ?? '').trim()}` : '',
    (patient.family_history ?? '').trim() ? `Familiaux : ${(patient.family_history ?? '').trim()}` : '',
  ].filter(Boolean).join('\n')

  const preparation = await preparerUn(
    supabase, doctor.id, patient.id, format(getNowInMaroc(), 'yyyy-MM-dd'),
  )

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {preparation && (
        <ResumePatient preparation={preparation} titre="Avant de commencer" compact />
      )}
      <ConsultationStructuree
        doctorId={doctor.id}
        patient={patient}
        appointmentId={aptId}
        existant={existant}
        dossier={{ antecedents, allergies: (patient.allergies ?? '').trim(), mesures: lignes.join('\n') }}
        rubriques={RUBRIQUES_GENERALISTE}
        trames={TRAMES_GENERALISTE}
        colonnesFacultatives={COLONNES_FACULTATIVES_GENERALISTE}
        retourCr="/generaliste/consultation/cr"
      />
    </div>
  )
}
