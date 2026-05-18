// API : liste et création de rendez-vous
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendConfirmationSMS } from '@/lib/twilio'
import { formatPhoneMaroc, generateCancelToken } from '@/lib/utils'

// GET /api/appointments?doctor_id=...&date=...
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  const date = searchParams.get('date')

  let query = supabase
    .from('appointments')
    .select('*, patient:patients(*)')
    .eq('doctor_id', doctorId!)
    .order('date', { ascending: true })
    .order('time', { ascending: true })

  if (date) query = query.eq('date', date)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
    date,
    time,
    notes,
    public: isPublic,
  } = body

  // Validation minimale
  if (!doctor_id || !first_name || !last_name || !phone || !date || !time) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  }

  // Pour les réservations du médecin, vérifie l'authentification
  const supabase = createClient()
  if (!isPublic) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Utilise le client admin pour les réservations publiques (bypass RLS)
  const db = isPublic ? createAdminClient() : supabase

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

  const formattedPhone = formatPhoneMaroc(phone)
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
  } else {
    const { data: newPatient, error: patientError } = await db
      .from('patients')
      .insert({ doctor_id, first_name, last_name, phone: formattedPhone })
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
      notes: notes || null,
      cancel_token: cancelToken,
    })
    .select('*')
    .single()

  if (aptError || !appointment) {
    return NextResponse.json({ error: 'Erreur création RDV' }, { status: 500 })
  }

  // Récupère les infos du médecin pour le SMS
  const { data: doctor } = await db
    .from('doctors')
    .select('name')
    .eq('id', doctor_id)
    .single()

  // Envoie le SMS de confirmation (async, non-bloquant)
  const baseUrl = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
  sendConfirmationSMS({
    to: formattedPhone,
    patientName: `${first_name} ${last_name}`,
    doctorName: doctor?.name ?? 'votre médecin',
    date,
    time,
    cancelToken,
    baseUrl,
  }).catch((err) => console.error('[SMS]', err))

  return NextResponse.json(appointment, { status: 201 })
}
