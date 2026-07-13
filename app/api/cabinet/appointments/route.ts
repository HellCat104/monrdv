// API de l'espace cabinet (secrétaire). Toutes les opérations passent par le
// client admin APRÈS vérification de l'appartenance à cabinet_staff et des
// permissions accordées par le médecin (getStaffContext).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { formatPhoneMaroc, isValidPhoneMaroc, generateCancelToken, getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

const sanitize = (s: string) => s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

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

  return NextResponse.json({
    appointments: aptRes.data ?? [],
    consultationTypes: typesRes.data ?? [],
    defaultDuration: docRes.data?.appointment_duration ?? 30,
    blocks: blocksRes.data ?? [],
    permissions: ctx.permissions,
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
  const first = sanitize(String(body.first_name ?? '')).substring(0, 100)
  const last = sanitize(String(body.last_name ?? '')).substring(0, 100)
  const phone = sanitize(String(body.phone ?? '')).substring(0, 20)
  const notes = body.notes ? sanitize(String(body.notes)).substring(0, 500) : null
  const date = String(body.date ?? '')
  const time = String(body.time ?? '')
  const typeId = body.consultation_type_id ? String(body.consultation_type_id) : null

  if (!first || !last || !phone || !date || !time) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
  }
  if (!isValidPhoneMaroc(phone)) {
    return NextResponse.json({ error: 'Numéro de téléphone invalide (format marocain, ex : 0612345678)' }, { status: 400 })
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
    .select('appointment_duration, specialty, specialties').eq('id', doctorId).single()
  let duration = doc?.appointment_duration ?? 30
  if (typeId) {
    const { data: ctype } = await admin.from('consultation_types')
      .select('id, duration_minutes').eq('id', typeId).eq('doctor_id', doctorId).eq('active', true).maybeSingle()
    if (!ctype) return NextResponse.json({ error: 'Motif invalide' }, { status: 400 })
    if (ctype.duration_minutes) duration = ctype.duration_minutes
  }

  // Dédoublonnage patient : téléphone + prénom + nom (même logique que la route principale)
  const formattedPhone = formatPhoneMaroc(phone)
  let patientId: string
  const { data: existing } = await admin.from('patients')
    .select('id').eq('doctor_id', doctorId).eq('phone', formattedPhone)
    .ilike('first_name', first).ilike('last_name', last).limit(1).maybeSingle()
  if (existing) {
    patientId = existing.id
  } else {
    const { data: created, error: pErr } = await admin.from('patients')
      .insert({ doctor_id: doctorId, first_name: first, last_name: last, phone: formattedPhone })
      .select('id').single()
    if (pErr || !created) return NextResponse.json({ error: 'Erreur création patient' }, { status: 500 })
    patientId = created.id
  }

  // Spécialité : mono-spécialité → celle du médecin, sinon null (comme la route principale)
  const docSpecs = (doc?.specialties && doc.specialties.length > 0)
    ? doc.specialties : (doc?.specialty ? [doc.specialty] : [])
  const specialty = docSpecs.length === 1 ? docSpecs[0] : null

  const { data: appointment, error: aptErr } = await admin.from('appointments')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      date,
      time,
      status: 'confirmed',
      notes,
      cancel_token: generateCancelToken(),
      consultation_type_id: typeId,
      specialty,
      duration_minutes: duration,
      consent_at: null,
    })
    .select('*').single()

  if (aptErr || !appointment) {
    // 23505 = même heure de départ ; 23P01 = chevauchement (contrainte d'exclusion)
    if (aptErr?.code === '23505' || aptErr?.code === '23P01') {
      return NextResponse.json({ error: 'Ce créneau est déjà pris. Choisissez-en un autre.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur création RDV' }, { status: 500 })
  }

  return NextResponse.json({ appointment }, { status: 201 })
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
    .select('id, doctor_id, amount_due, invoice_no').eq('id', id).eq('doctor_id', ctx.doctor.id).maybeSingle()
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
      const due = body.amount_due != null ? Number(body.amount_due) : null
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

  return NextResponse.json(updated)
}
