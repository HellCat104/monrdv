// Écran « consultation en cours » : dossier à gauche, note + constantes au centre,
// actions (ordonnance / certificat / encaisser / facture) à droite. Un seul écran.
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { allVitalDefs, resolveEnabledVitals, isPsychiatricDoctor, type VitalDef } from '@/types'
import { canAccess } from '@/lib/plan'
import { isDentalDoctor } from '@/lib/dental'
import ConsultationClient from './ConsultationClient'

export const dynamic = 'force-dynamic'

export default async function ConsultationPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, enabled_vitals, specialty, specialties, custom_vitals, plan')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()
  // L'écran consultation est réservé au forfait Cabinet complet
  if (!canAccess(doctor.plan, 'consultation')) redirect('/appointments')

  const { data: apt } = await supabase
    .from('appointments')
    .select('id, date, time, amount_paid, amount_due, payment_method, invoice_no, quote_id, consultation_type:consultation_types(id, name, default_price), patient:patients(id, first_name, last_name, age, birth_date, blood_group, phone, cin, mutuelle, allergies, chronic_conditions, surgeries, current_treatments, vaccinations)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!apt || !apt.patient) notFound()

  const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient
  const consultationType = Array.isArray(apt.consultation_type) ? apt.consultation_type[0] : apt.consultation_type

  // Données médicales pour le panneau gauche
  const [notesRes, presRes, vitalsRes, thisAptPresRes, thisAptCertRes, thisAptNoteRes] = await Promise.all([
    supabase.from('consultation_notes').select('id, note, created_at, appointment_id').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('prescriptions').select('id, content, created_at').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(3),
    supabase.from('vital_signs').select('id, values, measured_at').eq('patient_id', patient.id).order('measured_at', { ascending: false }).limit(3),
    // Ordonnances rédigées PENDANT cette consultation (ce RDV)
    supabase.from('prescriptions').select('id, content, created_at').eq('appointment_id', apt.id).order('created_at', { ascending: true }),
    // Certificats établis PENDANT cette consultation. Ils étaient enregistrés
    // avec le rendez-vous depuis toujours, mais rien ne les affichait : on
    // créait un arrêt de travail et l'écran restait identique, sans moyen de
    // le relire ni de le réimprimer sans sortir de la consultation.
    supabase.from('certificates').select('id, title, motif, created_at').eq('appointment_id', apt.id).order('created_at', { ascending: true }),
    // Note de CE rdv, cherchée directement par appointment_id (et non parmi les 5
    // dernières notes du patient : un chronique en cumule plus, on créait un doublon).
    supabase.from('consultation_notes').select('id, note, signed_at').eq('appointment_id', apt.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ])

  const existingNote = thisAptNoteRes.data ?? null

  // Feuille de soins : les lignes arrivent pré-remplies avec les actes du plan
  // de traitement marqués « réalisés » AUJOURD'HUI. À défaut, l'acte du jour
  // est la consultation elle-même. Le praticien relit au lieu de ressaisir.
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const { data: devisPatient } = await supabase
    .from('quotes')
    .select('items:quote_items(tooth, label, unit_price, quantity, done, done_at)')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patient.id)
  const actesDuJour = (devisPatient ?? [])
    .flatMap((q) => (q.items ?? []) as { tooth: string | null; label: string; unit_price: number; quantity: number; done: boolean; done_at: string | null }[])
    .filter((it) => it.done && (it.done_at ?? '').slice(0, 10) === aujourdhui)
    .map((it) => ({ tooth: it.tooth, label: it.label, amount: Number(it.unit_price) * (it.quantity || 1) }))

  const suggestionsFeuille = actesDuJour.length > 0
    ? actesDuJour
    : [{
        tooth: null,
        label: consultationType?.name ?? 'Consultation',
        amount: Number(apt.amount_due ?? consultationType?.default_price ?? 0),
      }]

  const vitalDefsAll = allVitalDefs((doctor.custom_vitals as VitalDef[] | null) ?? [])
  const enabled = resolveEnabledVitals(doctor.enabled_vitals, doctor.specialty)
  const vitalDefs = vitalDefsAll.filter((v) => enabled.includes(v.key))

  return (
    <ConsultationClient
      doctorId={doctor.id}
      appointmentId={apt.id}
      appointmentPaid={apt.amount_paid != null}
      regleSurDevis={(apt as { quote_id?: string | null }).quote_id != null}
      amountPaid={apt.amount_paid ?? null}
      amountDue={apt.amount_due ?? null}
      // Même priorité que l'agenda : le montant déjà fixé sur le RDV prime sur le
      // tarif du motif — sinon le « Total dû » pré-rempli diffère selon l'écran.
      defaultPrice={apt.amount_due ?? consultationType?.default_price ?? null}
      patient={patient}
      recentNotes={notesRes.data ?? []}
      recentPrescriptions={presRes.data ?? []}
      consultationPrescriptions={thisAptPresRes.data ?? []}
      recentVitals={vitalsRes.data ?? []}
      consultationCertificates={thisAptCertRes.data ?? []}
      consultationTypeId={consultationType?.id ?? null}
      existingNoteId={existingNote?.id ?? null}
      existingNote={existingNote?.note ?? ''}
      noteSigned={!!existingNote?.signed_at}
      vitalDefs={vitalDefs}
      vitalDefsAll={vitalDefsAll}
      isPsy={isPsychiatricDoctor([doctor.specialty, ...((doctor.specialties as string[] | null) ?? [])])}
      // Dentistes : le schéma dentaire se modifie PENDANT la consultation, pas
      // seulement depuis la fiche patient. Pas de test sur le forfait ici — cet
      // écran est déjà réservé au Cabinet complet par le canAccess ci-dessus.
      isDental={isDentalDoctor([doctor.specialty, ...((doctor.specialties as string[] | null) ?? [])])}
      // Feuille de soins : affichée seulement si le patient a une couverture —
      // sans organisme, il n'y a rien à faire rembourser, et la carte
      // encombrerait l'écran de consultation pour rien.
      mutuelle={(patient.mutuelle as string | null) ?? null}
      suggestionsFeuille={suggestionsFeuille}
    />
  )
}
