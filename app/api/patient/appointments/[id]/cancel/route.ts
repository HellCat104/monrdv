// API : annulation d'un RDV par le patient authentifié depuis son espace.
//
// Ce chemin n'envoyait AUCUN e-mail — ni au cabinet, ni au patient — alors que
// l'annulation par le lien reçu en e-mail (app/api/cancel/[token]) prévient les
// deux depuis toujours. La FAQ de la page d'accueil, balisée pour Google,
// affirme pourtant : « le cabinet est prévenu automatiquement ». Un créneau
// libéré que personne ne voyait, c'est un patient tourné et une place perdue.
//
// Les deux autres écarts avec le chemin par jeton sont corrigés ici aussi :
// un acte réglé n'est plus annulable en ligne, et la comparaison porte sur la
// date ET l'heure — un rendez-vous de ce matin n'est plus « à venir » à 15 h.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendCancellationEmailToPatient, sendCancellationEmailToDoctor } from '@/lib/email'
import { getNowInMaroc } from '@/lib/utils'
import { displayName } from '@/lib/profession'
import { format } from 'date-fns'

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
    .eq('user_id', user.id)

  const patientIds = (patientRecords ?? []).map((p: { id: string }) => p.id)
  if (patientIds.length === 0) {
    return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })
  }

  // Vérifie que le RDV appartient bien au patient et n'est pas déjà annulé
  const { data: appointment } = await adminDb
    .from('appointments')
    .select('id, status, date, time, invoice_no, amount_paid, patient:patients(first_name, last_name, phone, email), doctor:doctors(name, email, specialty)')
    .eq('id', params.id)
    .in('patient_id', patientIds)
    .single()

  if (!appointment) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  }

  if (appointment.status === 'cancelled') {
    return NextResponse.json({ error: 'RDV déjà annulé' }, { status: 400 })
  }

  // Date ET heure, en heure marocaine : comparer la seule date laissait
  // annuler à 15 h un rendez-vous de 9 h le matin même.
  const quand = `${appointment.date} ${String(appointment.time).substring(0, 5)}`
  if (quand < format(getNowInMaroc(), 'yyyy-MM-dd HH:mm')) {
    return NextResponse.json(
      { error: 'Ce rendez-vous est passé : il ne peut plus être annulé en ligne.' },
      { status: 409 })
  }

  // Un acte encaissé ou facturé relève de la comptabilité : son annulation
  // passe par le cabinet. Même règle que le chemin par jeton.
  if (appointment.invoice_no || appointment.amount_paid != null) {
    return NextResponse.json(
      { error: 'Ce rendez-vous a été réglé. Contactez le cabinet pour l\'annuler.' },
      { status: 409 })
  }

  const { error: majErr } = await adminDb
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', params.id)
    .neq('status', 'cancelled')

  // Un échec ignoré affichait « annulé » au patient sur un créneau toujours
  // réservé : il ne se serait pas présenté, et la place serait restée bloquée.
  if (majErr) {
    return NextResponse.json({ error: 'L’annulation n’a pas pu être enregistrée. Réessayez.' }, { status: 500 })
  }

  const patient = appointment.patient as { first_name?: string; last_name?: string; phone?: string; email?: string } | null
  const doctor = appointment.doctor as { name?: string; email?: string; specialty?: string } | null
  const patientName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim()

  // AWAIT obligatoire en serverless : sans lui, la fonction s'arrête avant que
  // les e-mails ne partent.
  const envois: Promise<unknown>[] = []

  if (patient?.email) {
    envois.push(
      sendCancellationEmailToPatient({
        patientEmail: patient.email,
        patientName,
        doctorName: displayName(doctor?.name ?? '', doctor?.specialty),
        specialty: doctor?.specialty ?? '',
        date: appointment.date,
        time: appointment.time,
      }).catch((err) => console.error('[Email] annulation patient (espace patient):', err))
    )
  }

  if (doctor?.email) {
    envois.push(
      sendCancellationEmailToDoctor({
        doctorEmail: doctor.email,
        doctorName: doctor.name ?? '',
        patientName,
        patientPhone: patient?.phone ?? '',
        date: appointment.date,
        time: appointment.time,
      }).catch((err) => console.error('[Email] annulation médecin (espace patient):', err))
    )
  }

  await Promise.allSettled(envois)

  return NextResponse.json({ success: true })
}
