// Écran « consultation en cours » : dossier à gauche, note + constantes au centre,
// actions (ordonnance / certificat / encaisser / facture) à droite. Un seul écran.
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { allVitalDefs, resolveEnabledVitals, isPsychiatricDoctor, type VitalDef } from '@/types'
import ConsultationClient from './ConsultationClient'

export const dynamic = 'force-dynamic'

export default async function ConsultationPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, enabled_vitals, specialty, specialties, custom_vitals')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  const { data: apt } = await supabase
    .from('appointments')
    .select('id, date, time, amount_paid, amount_due, payment_method, invoice_no, consultation_type:consultation_types(name, default_price), patient:patients(id, first_name, last_name, age, birth_date, blood_group, phone, cin, mutuelle, allergies, chronic_conditions, surgeries, current_treatments, vaccinations)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!apt || !apt.patient) notFound()

  const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient
  const consultationType = Array.isArray(apt.consultation_type) ? apt.consultation_type[0] : apt.consultation_type

  // Données médicales pour le panneau gauche
  const [notesRes, presRes, vitalsRes, thisAptPresRes] = await Promise.all([
    supabase.from('consultation_notes').select('id, note, created_at, appointment_id').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('prescriptions').select('id, content, created_at').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(3),
    supabase.from('vital_signs').select('id, values, measured_at').eq('patient_id', patient.id).order('measured_at', { ascending: false }).limit(3),
    // Ordonnances rédigées PENDANT cette consultation (ce RDV)
    supabase.from('prescriptions').select('id, content, created_at').eq('appointment_id', apt.id).order('created_at', { ascending: true }),
  ])

  // Note déjà saisie pour CE rdv (édition)
  const existingNote = (notesRes.data ?? []).find((n) => n.appointment_id === apt.id) ?? null

  const vitalDefsAll = allVitalDefs((doctor.custom_vitals as VitalDef[] | null) ?? [])
  const enabled = resolveEnabledVitals(doctor.enabled_vitals, doctor.specialty)
  const vitalDefs = vitalDefsAll.filter((v) => enabled.includes(v.key))

  return (
    <ConsultationClient
      doctorId={doctor.id}
      appointmentId={apt.id}
      appointmentPaid={apt.amount_paid != null}
      amountPaid={apt.amount_paid ?? null}
      amountDue={apt.amount_due ?? null}
      hasInvoice={!!apt.invoice_no}
      // Même priorité que l'agenda : le montant déjà fixé sur le RDV prime sur le
      // tarif du motif — sinon le « Total dû » pré-rempli diffère selon l'écran.
      defaultPrice={apt.amount_due ?? consultationType?.default_price ?? null}
      patient={patient}
      recentNotes={notesRes.data ?? []}
      recentPrescriptions={presRes.data ?? []}
      consultationPrescriptions={thisAptPresRes.data ?? []}
      recentVitals={vitalsRes.data ?? []}
      existingNoteId={existingNote?.id ?? null}
      existingNote={existingNote?.note ?? ''}
      vitalDefs={vitalDefs}
      vitalDefsAll={vitalDefsAll}
      isPsy={isPsychiatricDoctor([doctor.specialty, ...((doctor.specialties as string[] | null) ?? [])])}
    />
  )
}
