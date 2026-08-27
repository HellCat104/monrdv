// API de l'espace cabinet (secrétaire). Toutes les opérations passent par le
// client admin APRÈS vérification de l'appartenance à cabinet_staff et des
// permissions accordées par le médecin (getStaffContext).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { sendAppointmentConfirmationToPatient, sendRescheduleEmailToPatient, sendWithTimeout } from '@/lib/email'
import { displayName } from '@/lib/profession'
import { formatDateShort } from '@/lib/utils'
import { formatPhoneMaroc, isValidPhoneMaroc, generateCancelToken, getNowInMaroc, getDayKey, ageFromBirthDate } from '@/lib/utils'
import { format, parseISO, addDays, addMonths } from 'date-fns'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const sanitize = (s: string) => s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
// Neutralise les jokers LIKE (% et _) dans les recherches de doublon
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

// GET /api/cabinet/appointments?date=YYYY-MM-DD — agenda du jour + motifs actifs
export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.agenda) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })

  // Vue semaine : ?from=YYYY-MM-DD&to=YYYY-MM-DD renvoie la plage.
  // Sinon ?date= (ou aujourd'hui) pour la vue jour.
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const isRange = !!from && !!to
  const date = req.nextUrl.searchParams.get('date') || format(getNowInMaroc(), 'yyyy-MM-dd')
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (isRange) {
    if (!dateRe.test(from!) || !dateRe.test(to!) || to! < from!) return NextResponse.json({ error: 'Plage invalide' }, { status: 400 })
  } else if (!dateRe.test(date)) {
    return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  let aptQuery = admin.from('appointments')
    .select('id, date, time, status, attendance, queue_status, amount_paid, amount_due, payment_method, notes, duration_minutes, consultation_type_id, consultation_type:consultation_types(name), patient:patients(first_name, last_name, phone)')
    .eq('doctor_id', ctx.doctor.id)
  aptQuery = isRange
    ? aptQuery.gte('date', from!).lte('date', to!).order('date', { ascending: true }).order('time', { ascending: true })
    : aptQuery.eq('date', date).order('time', { ascending: true })

  const [aptRes, typesRes, docRes, blocksRes] = await Promise.all([
    aptQuery,
    admin.from('consultation_types')
      .select('id, name, duration_minutes, default_price')
      .eq('doctor_id', ctx.doctor.id).eq('active', true).order('created_at', { ascending: true }),
    admin.from('doctors').select('appointment_duration').eq('id', ctx.doctor.id).single(),
    isRange
      ? admin.from('blocked_dates').select('id, date, start_time, end_time, reason').eq('doctor_id', ctx.doctor.id).gte('date', from!).lte('date', to!)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  // Mode confidentiel : on retire le motif et le type de consultation
  // (la secrétaire ne voit que nom, heure, tél. et ses actions).
  let appointments = aptRes.data ?? []
  if (ctx.confidential) {
    appointments = appointments.map((a) => ({ ...a, notes: null, consultation_type: [] }))
  }

  return NextResponse.json({
    appointments,
    consultationTypes: ctx.confidential ? [] : (typesRes.data ?? []),
    defaultDuration: docRes.data?.appointment_duration ?? 30,
    blocks: blocksRes.data ?? [],
    permissions: ctx.permissions,
    confidential: ctx.confidential,
  })
}

// POST — créer un RDV (permission « Gérer les rendez-vous »)
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.manage_appointments) {
    return NextResponse.json({ error: 'Le médecin ne vous a pas donné la permission de créer des RDV.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  // ── Patient sans RDV (walk-in) : ajout direct à la file du jour ──
  if (body.walk_in === true) {
    const admin0 = createAdminClient()
    const doctorId0 = ctx.doctor.id
    let patientId0 = body.patient_id ? String(body.patient_id) : ''
    if (patientId0) {
      const { data: p } = await admin0.from('patients').select('id').eq('id', patientId0).eq('doctor_id', doctorId0).maybeSingle()
      if (!p) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })
    } else {
      const f = sanitize(String(body.first_name ?? '')).substring(0, 100)
      const l = sanitize(String(body.last_name ?? '')).substring(0, 100)
      const ph = sanitize(String(body.phone ?? '')).substring(0, 20)
      if (!f || !l || !ph) return NextResponse.json({ error: 'Prénom, nom et téléphone requis' }, { status: 400 })
      if (!isValidPhoneMaroc(ph)) return NextResponse.json({ error: 'Numéro invalide' }, { status: 400 })
      const bd0 = /^\d{4}-\d{2}-\d{2}$/.test(String(body.birth_date ?? '')) ? String(body.birth_date) : null
      const { data: created, error: pErr } = await admin0.from('patients')
        .insert({ doctor_id: doctorId0, first_name: f, last_name: l, phone: formatPhoneMaroc(ph), birth_date: bd0, age: ageFromBirthDate(bd0) }).select('id').single()
      if (pErr || !created) return NextResponse.json({ error: 'Erreur création patient' }, { status: 500 })
      patientId0 = created.id
    }
    const { data: doc0 } = await admin0.from('doctors').select('appointment_duration, specialty, specialties').eq('id', doctorId0).single()
    const specs0 = (doc0?.specialties && doc0.specialties.length > 0) ? doc0.specialties : (doc0?.specialty ? [doc0.specialty] : [])
    const now0 = getNowInMaroc()
    const { data: appt0, error: aErr } = await admin0.from('appointments').insert({
      doctor_id: doctorId0, patient_id: patientId0,
      date: format(now0, 'yyyy-MM-dd'), time: format(now0, 'HH:mm'),
      status: 'confirmed', walk_in: true, queue_status: 'arrive', attendance: 'present',
      cancel_token: generateCancelToken(), specialty: specs0.length === 1 ? specs0[0] : null,
      duration_minutes: doc0?.appointment_duration ?? 30, consent_at: null,
    }).select('*').single()
    if (aErr || !appt0) return NextResponse.json({ error: 'Échec de l\'ajout à la file' }, { status: 500 })
    return NextResponse.json({ appointment: appt0 }, { status: 201 })
  }

  const first = sanitize(String(body.first_name ?? '')).substring(0, 100)
  const last = sanitize(String(body.last_name ?? '')).substring(0, 100)
  const phone = sanitize(String(body.phone ?? '')).substring(0, 20)
  const notes = body.notes ? sanitize(String(body.notes)).substring(0, 500) : null
  const date = String(body.date ?? '')
  const time = String(body.time ?? '')
  const typeId = body.consultation_type_id ? String(body.consultation_type_id) : null
  // Date de naissance : alimente d'emblée les modules pédiatriques (courbes, vaccins)
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.birth_date ?? '')) ? String(body.birth_date) : null

  // La secrétaire choisit soit une fiche existante (patient_id), soit elle en
  // crée une nouvelle. L'e-mail conditionne l'envoi du rappel automatique.
  const existingId = body.patient_id ? String(body.patient_id) : ''
  const email = body.email ? sanitize(String(body.email)).substring(0, 254) : null

  if (!date || !time) {
    return NextResponse.json({ error: 'Date et heure requises' }, { status: 400 })
  }
  if (!existingId) {
    if (!first || !last || !phone) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }
    if (!isValidPhoneMaroc(phone)) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide (format marocain, ex : 0612345678)' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'E-mail invalide' }, { status: 400 })
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Format de date ou heure invalide' }, { status: 400 })
  }
  // La secrétaire répond au téléphone : le jour même est autorisé, le passé non.
  const today = format(getNowInMaroc(), 'yyyy-MM-dd')
  if (date < today) {
    return NextResponse.json({ error: 'Impossible de créer un RDV dans le passé' }, { status: 400 })
  }

  const admin = createAdminClient()
  const doctorId = ctx.doctor.id

  // Durée : celle du motif choisi, sinon la durée standard du médecin
  const { data: doc } = await admin.from('doctors')
    .select('name, appointment_duration, specialty, specialties, working_hours').eq('id', doctorId).single()
  let duration = doc?.appointment_duration ?? 30
  if (typeId) {
    const { data: ctype } = await admin.from('consultation_types')
      .select('id, duration_minutes').eq('id', typeId).eq('doctor_id', doctorId).eq('active', true).maybeSingle()
    if (!ctype) return NextResponse.json({ error: 'Motif invalide' }, { status: 400 })
    if (ctype.duration_minutes) duration = ctype.duration_minutes
  }

  let patientId: string
  // Destinataire de la confirmation : renseigné selon la branche empruntée
  let patientEmail: string | null = email
  let patientName = `${first} ${last}`.trim()
  if (existingId) {
    // Fiche choisie dans la liste : on vérifie qu'elle appartient bien à CE
    // médecin, sinon la secrétaire pourrait rattacher un RDV au patient d'un
    // autre cabinet en devinant un identifiant.
    const { data: owned } = await admin.from('patients')
      .select('id, first_name, last_name, email').eq('id', existingId).eq('doctor_id', doctorId).maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })
    patientId = owned.id
    patientEmail = owned.email ?? null
    patientName = `${owned.first_name ?? ''} ${owned.last_name ?? ''}`.trim()
  } else {
    // Dédoublonnage patient : téléphone + prénom + nom (même logique que la route principale)
    const formattedPhone = formatPhoneMaroc(phone)
    const { data: existing } = await admin.from('patients')
      .select('id').eq('doctor_id', doctorId).eq('phone', formattedPhone)
      .ilike('first_name', escapeLike(first)).ilike('last_name', escapeLike(last)).limit(1).maybeSingle()
    if (existing) {
      patientId = existing.id
      // Complète les champs que la fiche n'avait pas encore
      if (birthDate) await admin.from('patients').update({ birth_date: birthDate, age: ageFromBirthDate(birthDate) }).eq('id', patientId).is('birth_date', null)
      if (email) await admin.from('patients').update({ email }).eq('id', patientId).is('email', null)
    } else {
      const { data: created, error: pErr } = await admin.from('patients')
        .insert({ doctor_id: doctorId, first_name: first, last_name: last, phone: formattedPhone, email, birth_date: birthDate, age: ageFromBirthDate(birthDate) })
        .select('id').single()
      if (pErr || !created) return NextResponse.json({ error: 'Erreur création patient' }, { status: 500 })
      patientId = created.id
    }
  }

  // Spécialité : mono-spécialité → celle du médecin, sinon null (comme la route principale)
  const docSpecs = (doc?.specialties && doc.specialties.length > 0)
    ? doc.specialties : (doc?.specialty ? [doc.specialty] : [])
  const specialty = docSpecs.length === 1 ? docSpecs[0] : null

  // RDV récurrents : chaque occurrence est un vrai RDV, déplaçable/annulable
  // individuellement. Sans récurrence -> une seule date (comportement d'origine).
  const rec = body.recurrence as { freq?: string; count?: number } | undefined
  const freq = rec && ['weekly', 'biweekly', 'monthly'].includes(String(rec.freq)) ? String(rec.freq) : null
  const count = freq ? Math.min(26, Math.max(2, Math.floor(Number(rec?.count) || 0))) : 1
  const groupId = count > 1 ? randomUUID() : null

  const base = parseISO(date)
  const workingHours = (doc?.working_hours ?? {}) as Record<string, { enabled?: boolean } | undefined>
  const occurrences: string[] = []
  for (let k = 0; k < count; k++) {
    const d = freq === 'monthly' ? addMonths(base, k) : addDays(base, (freq === 'biweekly' ? 14 : 7) * k)
    // La 1re occurrence (le créneau choisi) est toujours tentée ; les suivantes
    // sont ignorées si le médecin ne travaille pas ce jour-là.
    if (k > 0 && workingHours[getDayKey(d)]?.enabled === false) continue
    occurrences.push(format(d, 'yyyy-MM-dd'))
  }

  const created: Record<string, unknown>[] = []
  const skipped: string[] = []
  let hardError = false
  for (const ds of occurrences) {
    const { data: appt, error: e } = await admin.from('appointments')
      .insert({
        doctor_id: doctorId,
        patient_id: patientId,
        date: ds,
        time,
        status: 'confirmed',
        notes,
        cancel_token: generateCancelToken(),
        consultation_type_id: typeId,
        specialty,
        duration_minutes: duration,
        consent_at: null,
        recurrence_group_id: groupId,
      })
      .select('*').single()
    if (e || !appt) {
      // 23505 = même heure de départ ; 23P01 = chevauchement (contrainte d'exclusion)
      if (e?.code === '23505' || e?.code === '23P01') { skipped.push(ds); continue }
      hardError = true; continue
    }
    created.push(appt)
  }

  if (created.length === 0) {
    if (hardError) return NextResponse.json({ error: 'Erreur création RDV' }, { status: 500 })
    return NextResponse.json({ error: 'Ce créneau est déjà pris. Choisissez-en un autre.' }, { status: 409 })
  }

  // Confirmation au patient — comme pour une réservation en ligne, avec son
  // lien d'annulation. Une série récurrente ne déclenche qu'UN e-mail (celui
  // de la première séance) : en envoyer huit d'un coup serait du spam.
  const firstAppt = created[0] as { cancel_token?: string; date?: string; time?: string }
  if (patientEmail && firstAppt?.cancel_token) {
    await sendWithTimeout(sendAppointmentConfirmationToPatient({
      patientEmail,
      patientName,
      doctorName: doc?.name ?? '',
      specialty: specialty ?? doc?.specialty ?? '',
      date: String(firstAppt.date ?? ''),
      time: String(firstAppt.time ?? ''),
      cancelToken: firstAppt.cancel_token,
    }), 'confirmation patient (cabinet)')
  }

  return NextResponse.json({ appointment: created[0], created: created.length, skipped }, { status: 201 })
}

// PATCH — présence / paiement / annulation, selon les permissions
export async function PATCH(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'RDV manquant' }, { status: 400 })

  const admin = createAdminClient()
  // Le RDV doit appartenir au cabinet de la secrétaire
  const { data: apt } = await admin.from('appointments')
    .select('id, doctor_id, amount_due, invoice_no, consultation_type_id, date, time, cancel_token, patient:patients(first_name, last_name, email)').eq('id', id).eq('doctor_id', ctx.doctor.id).maybeSingle()
  if (!apt) return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })

  const patch: Record<string, unknown> = {}

  // Pointage présence
  if ('attendance' in body) {
    if (!ctx.permissions.mark_attendance) return NextResponse.json({ error: 'Permission manquante (présences)' }, { status: 403 })
    const allowed = ['present', 'absent', 'late', null]
    if (!allowed.includes(body.attendance)) return NextResponse.json({ error: 'Valeur de présence invalide' }, { status: 400 })
    patch.attendance = body.attendance
  }

  // Salle d'attente : arrivé / en consultation / parti
  if ('queue_status' in body) {
    if (!ctx.permissions.mark_attendance) return NextResponse.json({ error: 'Permission manquante (salle d\'attente)' }, { status: 403 })
    const allowed = ['arrive', 'en_consultation', 'parti', null]
    if (!allowed.includes(body.queue_status)) return NextResponse.json({ error: 'Statut de file invalide' }, { status: 400 })
    patch.queue_status = body.queue_status
    // « Arrivé » vaut pointage présent (cohérence avec les statistiques de présence)
    if (body.queue_status === 'arrive') patch.attendance = 'present'
  }

  // Encaissement
  if ('amount_paid' in body) {
    if (!ctx.permissions.payments) return NextResponse.json({ error: 'Permission manquante (encaissements)' }, { status: 403 })
    if (body.amount_paid === null) {
      patch.amount_paid = null; patch.amount_due = null; patch.payment_method = null; patch.paid_at = null
    } else {
      const paid = Number(body.amount_paid)
      let due = body.amount_due != null ? Number(body.amount_due) : null
      // Sans le droit « Modifier le prix des actes », la secrétaire encaisse
      // au tarif officiel du médecin : on ignore un total dû envoyé par le client.
      if (!ctx.permissions.edit_prices) {
        let official = apt.amount_due ?? null
        if (official == null && apt.consultation_type_id) {
          const { data: ct } = await admin.from('consultation_types').select('default_price').eq('id', apt.consultation_type_id).maybeSingle()
          official = ct?.default_price ?? null
        }
        due = official
      }
      if (!Number.isFinite(paid) || paid < 0 || paid > 100000) return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
      if (due != null && (!Number.isFinite(due) || due < paid)) return NextResponse.json({ error: 'Le total dû doit être ≥ au montant payé' }, { status: 400 })
      const method = body.payment_method ? String(body.payment_method) : null
      if (method && !['especes', 'carte', 'cheque', 'virement'].includes(method)) return NextResponse.json({ error: 'Mode de règlement invalide' }, { status: 400 })
      patch.amount_paid = paid
      patch.amount_due = due
      patch.payment_method = method
      patch.paid_at = new Date().toISOString()
    }
  }

  // Annulation
  if (body.status === 'cancelled') {
    if (!ctx.permissions.manage_appointments) return NextResponse.json({ error: 'Permission manquante (gestion des RDV)' }, { status: 403 })
    if (apt.invoice_no) return NextResponse.json({ error: 'RDV facturé : demandez au médecin d\'émettre un avoir.' }, { status: 409 })
    patch.status = 'cancelled'
  }

  // Déplacement (nouvelle date / heure)
  if ('date' in body || 'time' in body) {
    if (!ctx.permissions.manage_appointments) return NextResponse.json({ error: 'Permission manquante (gestion des RDV)' }, { status: 403 })
    const nd = String(body.date ?? ''), nt = String(body.time ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd) || !/^\d{2}:\d{2}$/.test(nt)) return NextResponse.json({ error: 'Date ou heure invalide' }, { status: 400 })
    const today = format(getNowInMaroc(), 'yyyy-MM-dd')
    if (nd < today) return NextResponse.json({ error: 'Impossible de déplacer dans le passé' }, { status: 400 })
    patch.date = nd
    patch.time = nt
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })

  const { data: updated, error } = await admin.from('appointments')
    .update(patch).eq('id', id).eq('doctor_id', ctx.doctor.id).select('*').single()
  if (error) {
    if (error.code === '23505' || error.code === '23P01') {
      return NextResponse.json({ error: 'Ce créneau chevauche un rendez-vous existant.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })
  }
  if (!updated) return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })

  // Déplacement : prévenir le patient, comme le fait la route médecin.
  const moved = ('date' in body || 'time' in body) && body.status !== 'cancelled'
  const pat = apt.patient as { first_name?: string; last_name?: string; email?: string } | null
  if (moved && pat?.email && (apt.date !== updated.date || apt.time !== updated.time)) {
    const { data: docInfo } = await admin.from('doctors').select('name, specialty').eq('id', ctx.doctor.id).single()
    await sendWithTimeout(sendRescheduleEmailToPatient({
      patientEmail: pat.email,
      patientName: `${pat.first_name ?? ''} ${pat.last_name ?? ''}`.trim(),
      doctorName: displayName(docInfo?.name ?? '', docInfo?.specialty),
      specialty: docInfo?.specialty ?? '',
      oldDate: formatDateShort(String(apt.date)),
      oldTime: String(apt.time),
      newDate: formatDateShort(String(updated.date)),
      newTime: String(updated.time),
      cancelToken: updated.cancel_token ?? undefined,
    }), 'déplacement patient (cabinet)')
  }

  return NextResponse.json(updated)
}
