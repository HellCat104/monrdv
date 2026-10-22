// Écran « consultation en cours » : dossier à gauche, note + constantes au centre,
// actions (ordonnance / certificat / encaisser / facture) à droite. Un seul écran.
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { allVitalDefs, resolveEnabledVitals, isPsychiatricDoctor, type VitalDef } from '@/types'
import { canAccess } from '@/lib/plan'
import { colonneAbsente, tableAbsente } from '@/lib/migrations'
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
    .select('id, date, time, queue_status, amount_paid, amount_due, payment_method, invoice_no, quote_id, consultation_type:consultation_types(id, name, default_price), patient:patients(id, first_name, last_name, age, birth_date, blood_group, phone, cin, mutuelle, allergies, chronic_conditions, surgeries, current_treatments, vaccinations)')
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

  // Colonnes de la v76, lues À PART du rendez-vous : les mettre dans le select
  // principal ferait tomber TOUT l'écran de consultation tant que la migration
  // n'est pas passée. Règle de la maison — une fonctionnalité sans sa migration
  // se désactive, elle ne casse rien.
  const { data: v76Row, error: v76Err } = await supabase
    .from('appointments')
    .select('reprogrammer_jours')
    .eq('id', apt.id)
    .maybeSingle()
  const v76 = !colonneAbsente(v76Err?.code)
  const reprogrammerJours = (v76Row as { reprogrammer_jours?: number | null } | null)?.reprogrammer_jours ?? null

  // Le prochain rendez-vous DÉJÀ donné à ce patient.
  //
  // Le bandeau de confirmation n'existait que dans la mémoire de l'écran :
  // sortir faire un certificat et revenir le faisait disparaître, et le bouton
  // « Prochain rendez-vous » réapparaissait comme si rien n'avait été fait.
  // Un praticien distrait pouvait en donner un second. On relit donc.
  const { data: suivants } = await supabase
    .from('appointments')
    .select('date, time')
    .eq('patient_id', patient.id)
    .eq('doctor_id', doctor.id)
    .neq('id', apt.id)
    .neq('status', 'cancelled')
    .gte('date', aujourdhui)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(5)
  // Un rendez-vous du matin alors qu'on consulte l'après-midi n'est pas « le
  // prochain » : on ne garde que ce qui vient APRÈS celui-ci.
  const prochainRdv = (suivants ?? []).find(
    (r) => r.date > apt.date || (r.date === apt.date && String(r.time) > String(apt.time)),
  ) ?? null

  // Les mots échangés avec l'accueil au sujet de ce rendez-vous (v77). Lus à
  // part, comme le reste : pas de table, pas de fil, mais l'écran s'affiche.
  const { data: motsRows, error: motsErr } = await supabase
    .from('appointment_messages')
    .select('id, auteur, auteur_nom, contenu, created_at')
    .eq('appointment_id', apt.id)
    .order('created_at', { ascending: true })
  const v77 = !tableAbsente(motsErr?.code)

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
      queueStatus={(apt as { queue_status?: string | null }).queue_status ?? null}
      reprogrammerJours={reprogrammerJours}
      v76={v76}
      prochainRdv={prochainRdv}
      mots={motsRows ?? []}
      v77={v77}
      doctorName={doctor.name}
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
