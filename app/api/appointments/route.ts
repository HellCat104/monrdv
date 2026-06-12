// API : liste et création de rendez-vous
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendNewAppointmentToDoctor, sendAppointmentConfirmationToPatient } from '@/lib/email'
import { formatPhoneMaroc, isValidPhoneMaroc, generateCancelToken, getSlotsForDuration, getDayKey, getNowInMaroc, getDayBreaks } from '@/lib/utils'
import { format } from 'date-fns'

// GET /api/appointments?doctor_id=...&date=...
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Vérifie que le doctor_id demandé appartient bien au médecin connecté
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  const date = searchParams.get('date')

  // Sécurité : ignore le doctor_id passé en param, utilise toujours celui du token auth
  let query = supabase
    .from('appointments')
    .select('*, patient:patients(*)')
    .eq('doctor_id', doctor.id)
    .order('date', { ascending: true })
    .order('time', { ascending: true })

  if (date) query = query.eq('date', date)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })

  return NextResponse.json(data)
}

// POST /api/appointments — création d'un RDV (médecin ou patient public)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    doctor_id,
    first_name,
    last_name,
    phone,
    email,
    age,
    date,
    time,
    notes,
    consultation_type_id,
    public: isPublic,
  } = body

  // Validation minimale
  if (!doctor_id || !first_name || !last_name || !phone || !date || !time) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  }

  // Pour les réservations publiques (patient), l'email est obligatoire
  // (seul moyen d'envoyer confirmation + rappel)
  if (isPublic) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json({ error: 'Un email valide est obligatoire pour recevoir votre confirmation et votre rappel' }, { status: 400 })
    }
  }

  // Sanitisation et limites de longueur pour les champs texte
  const sanitize = (s: string) => s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  const safeFirst  = sanitize(first_name).substring(0, 100)
  const safeLast   = sanitize(last_name).substring(0, 100)
  const safePhone  = sanitize(phone).substring(0, 20)
  const safeEmail  = email ? sanitize(email).substring(0, 254) : undefined
  const safeNotes  = notes ? sanitize(notes).substring(0, 500) : undefined
  const safeAge    = age && Number.isInteger(age) && age > 0 && age <= 120 ? age : undefined

  // Validation du numéro de téléphone marocain
  if (!isValidPhoneMaroc(safePhone)) {
    return NextResponse.json({ error: 'Numéro de téléphone invalide (format marocain attendu, ex: 0612345678)' }, { status: 400 })
  }

  // Validation format date (YYYY-MM-DD) et heure (HH:MM)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Format de date ou heure invalide' }, { status: 400 })
  }

  // Interdit les RDV le jour même
  const today = format(getNowInMaroc(), 'yyyy-MM-dd')
  if (date <= today) {
    return NextResponse.json({ error: 'Les réservations le jour même ne sont pas acceptées' }, { status: 400 })
  }

  // Pour les réservations du médecin, vérifie l'authentification
  const supabase = createClient()
  const { data: { user: bookingUser } } = await supabase.auth.getUser()
  if (!isPublic) {
    if (!bookingUser) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Utilise le client admin pour les réservations publiques (bypass RLS)
  const db = isPublic ? createAdminClient() : supabase

  // Vérifie que le médecin existe, est approuvé et a un abonnement actif
  const { data: doctorCheck } = await db
    .from('doctors')
    .select('id, status, subscription_status, working_hours, appointment_duration')
    .eq('id', doctor_id)
    .single()

  if (!doctorCheck || doctorCheck.status !== 'approved') {
    return NextResponse.json({ error: 'Ce médecin n\'accepte pas les réservations en ligne' }, { status: 403 })
  }

  if (doctorCheck.subscription_status !== 'actif') {
    return NextResponse.json({ error: 'Ce médecin n\'accepte pas les réservations en ligne' }, { status: 403 })
  }

  // Résout la durée du RDV côté serveur (jamais confiance au client) :
  // durée du motif choisi si valide, sinon durée de base du médecin.
  let appointmentDuration = doctorCheck.appointment_duration
  let safeTypeId: string | null = null
  if (consultation_type_id) {
    const { data: ctype } = await db
      .from('consultation_types')
      .select('id, duration_minutes')
      .eq('id', consultation_type_id)
      .eq('doctor_id', doctor_id)
      .eq('active', true)
      .maybeSingle()
    if (ctype) {
      appointmentDuration = ctype.duration_minutes
      safeTypeId = ctype.id
    }
  }

  // RDV existants du jour (intervalles occupés, durées variables)
  const { data: dayAppointments } = await db
    .from('appointments')
    .select('time, duration_minutes')
    .eq('doctor_id', doctor_id)
    .eq('date', date)
    .neq('status', 'cancelled')

  const occupied = (dayAppointments ?? []).map((a) => ({
    time: a.time.substring(0, 5),
    duration: a.duration_minutes || doctorCheck.appointment_duration,
  }))

  // Restrictions de créneau — UNIQUEMENT pour les réservations publiques (patients).
  // Le médecin reste maître de son agenda : il peut réserver pendant sa pause,
  // un jour fermé ou un jour de congé (cas d'urgence, faveur, etc.).
  if (isPublic) {
    const parsedDate = new Date(`${date}T00:00:00`)
    const dayKey = getDayKey(parsedDate)
    const daySchedule = doctorCheck.working_hours?.[dayKey]

    if (!daySchedule?.enabled) {
      return NextResponse.json({ error: 'Ce jour n\'est pas ouvert à la réservation' }, { status: 400 })
    }

    const slots = getSlotsForDuration(
      daySchedule.start,
      daySchedule.end,
      appointmentDuration,
      doctorCheck.appointment_duration,
      getDayBreaks(daySchedule),
      occupied
    )

    const slot = slots.find((s) => s.time === time)
    if (!slot) {
      return NextResponse.json({ error: 'Ce créneau n\'est pas disponible' }, { status: 400 })
    }
    if (!slot.available) {
      return NextResponse.json({ error: 'Ce créneau est déjà réservé' }, { status: 409 })
    }

    const { data: blockedDate } = await db
      .from('blocked_dates')
      .select('id')
      .eq('doctor_id', doctor_id)
      .eq('date', date)
      .maybeSingle()

    if (blockedDate) {
      return NextResponse.json({ error: 'Cette date n\'est pas disponible' }, { status: 400 })
    }
  } else {
    // Médecin : pas de restriction d'horaires, mais on bloque quand même
    // le chevauchement avec un RDV existant (pas deux patients en même temps).
    const newStart = parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10)
    const newEnd = newStart + appointmentDuration
    const overlaps = occupied.some((o) => {
      const s = parseInt(o.time.slice(0, 2), 10) * 60 + parseInt(o.time.slice(3, 5), 10)
      return newStart < s + o.duration && newEnd > s
    })
    if (overlaps) {
      return NextResponse.json({ error: 'Ce créneau chevauche un rendez-vous existant' }, { status: 409 })
    }
  }

  const formattedPhone = formatPhoneMaroc(safePhone)
  const cancelToken = generateCancelToken()
  const shouldLinkPatientToUser =
    !!bookingUser && (
      (!!safeEmail && bookingUser.email === safeEmail) ||
      (!!bookingUser.phone && bookingUser.phone === formattedPhone)
    )

  // Trouve ou crée le patient — dédoublonnage par NOM + PRÉNOM + TÉLÉPHONE
  // (insensible à la casse) pour un même médecin. Le téléphone est l'identifiant
  // fiable : deux homonymes avec des numéros différents = deux personnes distinctes.
  let patientId: string

  const { data: existingPatient } = await db
    .from('patients')
    .select('id')
    .eq('doctor_id', doctor_id)
    .eq('phone', formattedPhone)
    .ilike('first_name', safeFirst)
    .ilike('last_name', safeLast)
    .limit(1)
    .maybeSingle()

  if (existingPatient) {
    patientId = existingPatient.id
    // Complète email/âge si fournis — on NE touche PAS au téléphone (clé d'identité)
    const updates: Record<string, unknown> = {}
    if (safeEmail) updates.email = safeEmail
    if (safeAge) updates.age = safeAge
    if (Object.keys(updates).length > 0) {
      await db.from('patients').update(updates).eq('id', patientId)
    }
    if (shouldLinkPatientToUser) {
      await db.from('patients').update({ user_id: bookingUser.id }).eq('id', patientId).is('user_id', null)
    }
  } else {
    const { data: newPatient, error: patientError } = await db
      .from('patients')
      .insert({
        doctor_id,
        first_name: safeFirst,
        last_name: safeLast,
        phone: formattedPhone,
        email: safeEmail || null,
        age: safeAge || null,
        user_id: shouldLinkPatientToUser ? bookingUser.id : null,
      })
      .select('id')
      .single()

    if (patientError || !newPatient) {
      return NextResponse.json({ error: 'Erreur création patient' }, { status: 500 })
    }
    patientId = newPatient.id
  }

  // Crée le rendez-vous
  const { data: appointment, error: aptError } = await db
    .from('appointments')
    .insert({
      doctor_id,
      patient_id: patientId,
      date,
      time,
      status: 'confirmed',
      notes: safeNotes || null,
      cancel_token: cancelToken,
      consultation_type_id: safeTypeId,
      duration_minutes: appointmentDuration,
    })
    .select('*')
    .single()

  if (aptError || !appointment) {
    // Race condition : le créneau a été pris entre la vérification et l'insertion.
    // L'index unique (unique_active_slot) renvoie le code Postgres 23505.
    if (aptError?.code === '23505') {
      return NextResponse.json({ error: 'Ce créneau vient d\'être réservé. Veuillez en choisir un autre.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur création RDV' }, { status: 500 })
  }

  // Récupère les infos du médecin pour le SMS et les emails
  const { data: doctor } = await db
    .from('doctors')
    .select('name, email, specialty')
    .eq('id', doctor_id)
    .single()

  const baseUrl = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
  const patientName = `${safeFirst} ${safeLast}`

  // Envoi des emails — AWAIT obligatoire en serverless, sinon la fonction
  // se termine avant que l'email parte (les promesses non attendues sont tuées).
  const emailTasks: Promise<unknown>[] = []

  // Email de notification au médecin (nouveau RDV)
  if (doctor) {
    emailTasks.push(
      sendNewAppointmentToDoctor({
        doctorEmail: doctor.email,
        doctorName: doctor.name,
        patientName,
        patientPhone: formattedPhone,
        date,
        time,
        notes: safeNotes,
      }).catch((err) => console.error('[Email] notif médecin:', err))
    )
  }

  // Email de confirmation au patient (si email fourni)
  if (email && doctor) {
    emailTasks.push(
      sendAppointmentConfirmationToPatient({
        patientEmail: email,
        patientName,
        doctorName: doctor.name,
        specialty: doctor.specialty,
        date,
        time,
        cancelToken,
      }).catch((err) => console.error('[Email] confirmation patient:', err))
    )
  }

  await Promise.allSettled(emailTasks)

  return NextResponse.json(appointment, { status: 201 })
}
