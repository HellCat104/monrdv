// API : liste et création de rendez-vous
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendNewAppointmentToDoctor, sendAppointmentConfirmationToPatient } from '@/lib/email'
import { formatPhoneMaroc, generateCancelToken } from '@/lib/utils'

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
    public: isPublic,
  } = body

  // Validation minimale
  if (!doctor_id || !first_name || !last_name || !phone || !date || !time) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  }

  // Sanitisation et limites de longueur pour les champs texte
  const sanitize = (s: string) => s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  const safeFirst  = sanitize(first_name).substring(0, 100)
  const safeLast   = sanitize(last_name).substring(0, 100)
  const safePhone  = sanitize(phone).substring(0, 20)
  const safeEmail  = email ? sanitize(email).substring(0, 254) : undefined
  const safeNotes  = notes ? sanitize(notes).substring(0, 500) : undefined
  const safeAge    = age && Number.isInteger(age) && age > 0 && age <= 120 ? age : undefined

  // Validation format date (YYYY-MM-DD) et heure (HH:MM)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Format de date ou heure invalide' }, { status: 400 })
  }

  // Interdit les RDV le jour même
  const today = new Date().toISOString().split('T')[0]
  if (date <= today) {
    return NextResponse.json({ error: 'Les réservations le jour même ne sont pas acceptées' }, { status: 400 })
  }

  // Pour les réservations du médecin, vérifie l'authentification
  const supabase = createClient()
  if (!isPublic) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Utilise le client admin pour les réservations publiques (bypass RLS)
  const db = isPublic ? createAdminClient() : supabase

  // Vérifie que le médecin existe, est approuvé et a un abonnement actif
  const { data: doctorCheck } = await db
    .from('doctors')
    .select('id, status, subscription_status')
    .eq('id', doctor_id)
    .single()

  if (!doctorCheck || doctorCheck.status !== 'approved') {
    return NextResponse.json({ error: 'Ce médecin n\'accepte pas les réservations en ligne' }, { status: 403 })
  }

  if (doctorCheck.subscription_status !== 'actif') {
    return NextResponse.json({ error: 'Ce médecin n\'accepte pas les réservations en ligne' }, { status: 403 })
  }

  // Vérifie que le créneau n'est pas déjà pris
  const { data: existing } = await db
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctor_id)
    .eq('date', date)
    .eq('time', time)
    .neq('status', 'cancelled')
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Ce créneau est déjà réservé' }, { status: 409 })
  }

  const formattedPhone = formatPhoneMaroc(safePhone)
  const cancelToken = generateCancelToken()

  // Trouve ou crée le patient
  let patientId: string

  const { data: existingPatient } = await db
    .from('patients')
    .select('id')
    .eq('doctor_id', doctor_id)
    .eq('phone', formattedPhone)
    .single()

  if (existingPatient) {
    patientId = existingPatient.id
    // Update email if patient didn't have one
    if (safeEmail) {
      await db.from('patients').update({ email: safeEmail }).eq('id', patientId).is('email', null)
    }
  } else {
    const { data: newPatient, error: patientError } = await db
      .from('patients')
      .insert({ doctor_id, first_name: safeFirst, last_name: safeLast, phone: formattedPhone, email: safeEmail || null, age: safeAge || null })
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
    })
    .select('*')
    .single()

  if (aptError || !appointment) {
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

  // Email de notification au médecin (nouveau RDV)
  if (doctor) {
    sendNewAppointmentToDoctor({
      doctorEmail: doctor.email,
      doctorName: doctor.name,
      patientName,
      patientPhone: formattedPhone,
      date,
      time,
      notes: safeNotes,
    }).catch((err) => console.error('[Email] notif médecin:', err))
  }

  // Email de confirmation au patient (si email fourni)
  if (email && doctor) {
    sendAppointmentConfirmationToPatient({
      patientEmail: email,
      patientName,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      date,
      time,
      cancelToken,
    }).catch((err) => console.error('[Email] confirmation patient:', err))
  }

  return NextResponse.json(appointment, { status: 201 })
}
