// API : annulation de RDV via le lien email
// POST uniquement — un GET ne doit jamais muter (les scanners d'emails préchargent les liens)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
import { sendCancellationEmailToPatient, sendCancellationEmailToDoctor } from '@/lib/email'
import { proposerCreneauLibere, creneauDuRdv } from '@/lib/waitlist'

// POST /api/cancel/[token] — annule le RDV (déclenché par un clic explicite sur la page /annuler)
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createAdminClient()

  // On lit avant d'écrire : un lien d'annulation ne périmait jamais et pouvait
  // donc réécrire l'historique — annuler un rendez-vous passé, ou déjà facturé.
  const { data: existant } = await supabase
    .from('appointments')
    .select('id, doctor_id, date, time, status, invoice_no, amount_paid, duration_minutes, walk_in')
    .eq('cancel_token', params.token)
    .maybeSingle()

  if (!existant || existant.status === 'cancelled') {
    return NextResponse.json({ error: 'Lien invalide ou rendez-vous déjà annulé' }, { status: 404 })
  }

  const maintenant = getNowInMaroc()
  const quand = `${existant.date} ${String(existant.time).substring(0, 5)}`
  if (quand < format(maintenant, 'yyyy-MM-dd HH:mm')) {
    return NextResponse.json(
      { error: 'Ce rendez-vous est passé : il ne peut plus être annulé en ligne.' },
      { status: 409 })
  }

  // Un acte encaissé ou facturé relève de la comptabilité : son annulation
  // passe par le cabinet, pas par un lien reçu en e-mail.
  if (existant.invoice_no || existant.amount_paid != null) {
    return NextResponse.json(
      { error: 'Ce rendez-vous a été réglé. Contactez le cabinet pour l\'annuler.' },
      { status: 409 })
  }

  const { data: appointment, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', existant.id)
    .neq('status', 'cancelled')
    .select('date, time, patient:patients(first_name, last_name, phone, email), doctor:doctors(name, email, specialty)')
    .single()

  if (error || !appointment) {
    return NextResponse.json({ error: 'Lien invalide ou rendez-vous déjà annulé' }, { status: 404 })
  }

  const patient = appointment.patient as any
  const doctor  = appointment.doctor  as any
  const patientName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim()

  // Emails — AWAIT obligatoire en serverless (sinon tués avant l'envoi)
  const emailTasks: Promise<unknown>[] = []

  if (patient?.email) {
    emailTasks.push(
      sendCancellationEmailToPatient({
        patientEmail: patient.email,
        patientName,
        doctorName:  doctor?.name     ?? '',
        specialty:   doctor?.specialty ?? '',
        date: appointment.date,
        time: appointment.time,
      }).catch((err) => console.error('[Email] annulation patient:', err))
    )
  }

  if (doctor?.email) {
    emailTasks.push(
      sendCancellationEmailToDoctor({
        doctorEmail:  doctor.email,
        doctorName:   doctor.name     ?? '',
        patientName,
        patientPhone: patient?.phone  ?? '',
        date: appointment.date,
        time: appointment.time,
      }).catch((err) => console.error('[Email] annulation médecin:', err))
    )
  }

  // LISTE D'ATTENTE — le patient libère sa place depuis l'e-mail. On n'arrive
  // ici qu'après l'UPDATE conditionnel (.neq('status','cancelled')) qui a
  // renvoyé une ligne : la place vient réellement de se libérer, et c'est
  // cette requête-là qui l'a libérée (deux clics concurrents : un seul passe).
  // `existant` a été lu avant l'écriture : c'est bien l'ancien créneau.
  emailTasks.push(proposerCreneauLibere(creneauDuRdv('annulation', existant)))

  await Promise.allSettled(emailTasks)

  return NextResponse.json({ success: true, date: appointment.date, time: appointment.time })
}
