// API droits patients (loi 09-08) : accès, rectification, effacement
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// GET — Droit d'accès : retourne toutes les données du patient
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  const { data: patients } = await adminDb
    .from('patients')
    .select('id, first_name, last_name, phone, email, created_at')
    .eq('user_id', user.id)

  const patientIds = (patients ?? []).map((p: any) => p.id)

  let appointments: any[] = []
  if (patientIds.length > 0) {
    const { data } = await adminDb
      .from('appointments')
      .select('id, date, time, status, notes, created_at, doctor:doctors(name, specialty)')
      .in('patient_id', patientIds)
      .order('date', { ascending: false })
    appointments = data ?? []
  }

  return NextResponse.json({
    account: { email: user.email, created_at: user.created_at },
    patients: patients ?? [],
    appointments,
  })
}

// PATCH — Droit de rectification : modifier téléphone ou email
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { phone, email } = body

  // Validation format
  const phoneRegex = /^\+?[\d\s\-().]{7,20}$/
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (phone && !phoneRegex.test(String(phone).trim())) {
    return NextResponse.json({ error: 'Format de téléphone invalide' }, { status: 400 })
  }
  if (email && !emailRegex.test(String(email).trim())) {
    return NextResponse.json({ error: 'Format d\'email invalide' }, { status: 400 })
  }

  const adminDb = createAdminClient()

  const updates: Record<string, string> = {}
  if (phone) updates.phone = String(phone).trim().substring(0, 20)
  if (email) updates.email = String(email).trim().substring(0, 254)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 })
  }

  await adminDb
    .from('patients')
    .update(updates)
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}

// DELETE — Droit à l'effacement : supprime le compte et les données
export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  // Récupère les IDs patients
  const { data: patients } = await adminDb
    .from('patients')
    .select('id')
    .eq('user_id', user.id)

  const patientIds = (patients ?? []).map((p: any) => p.id)

  // Annule les RDV futurs
  if (patientIds.length > 0) {
    const today = new Date().toISOString().split('T')[0]
    await adminDb
      .from('appointments')
      .update({ status: 'cancelled' })
      .in('patient_id', patientIds)
      .gte('date', today)
      .neq('status', 'cancelled')

    // Anonymise les données patient (ne supprime pas les RDV passés pour le médecin).
    // Efface aussi tout le dossier médical enrichi (loi 09-08 : suppression réelle
    // des données personnelles à la demande de la personne concernée).
    await adminDb
      .from('patients')
      .update({
        first_name: 'Supprimé', last_name: '', phone: '', email: null, user_id: null,
        age: null, notes: null,
        allergies: null, chronic_conditions: null, current_treatments: null,
      })
      .in('id', patientIds)

    // Efface les notes de consultation et ordonnances rattachées à ces patients
    await adminDb.from('consultation_notes').delete().in('patient_id', patientIds)
    await adminDb.from('prescriptions').delete().in('patient_id', patientIds)
  }

  // Supprime le compte auth
  await adminDb.auth.admin.deleteUser(user.id)

  return NextResponse.json({ success: true })
}
