// API : annulation d'un RDV par le patient authentifié
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  // Récupère les IDs patients liés à ce compte
  const { data: patientRecords } = await adminDb
    .from('patients')
    .select('id')
    .or(`user_id.eq.${user.id}${user.email ? `,email.eq.${user.email}` : ''}`)

  const patientIds = (patientRecords ?? []).map((p: { id: string }) => p.id)
  if (patientIds.length === 0) {
    return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })
  }

  // Vérifie que le RDV appartient bien au patient et n'est pas déjà annulé
  const { data: appointment } = await adminDb
    .from('appointments')
    .select('id, status, date')
    .eq('id', params.id)
    .in('patient_id', patientIds)
    .single()

  if (!appointment) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  }

  if (appointment.status === 'cancelled') {
    return NextResponse.json({ error: 'RDV déjà annulé' }, { status: 400 })
  }

  // Empêche l'annulation d'un RDV passé
  const today = new Date().toISOString().split('T')[0]
  if (appointment.date < today) {
    return NextResponse.json({ error: 'Impossible d\'annuler un RDV passé' }, { status: 400 })
  }

  await adminDb
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
