// API : annulation de RDV via le lien email
// POST uniquement — un GET ne doit jamais muter (les scanners d'emails préchargent les liens)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendCancellationEmailToPatient, sendCancellationEmailToDoctor } from '@/lib/email'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'

// POST /api/cancel/[token] — annule le RDV (déclenché par un clic explicite sur la page /annuler)
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createAdminClient()

  // Un lien ne doit jamais altérer l'historique clinique ou comptable.
  const { data: candidate } = await supabase.from('appointments')
    .select('id, date, time, invoice_no, amount_paid, status')
    .eq('cancel_token', params.token)
    .maybeSingle()
  const today = format(getNowInMaroc(), 'yyyy-MM-dd')
  const nowTime = format(getNowInMaroc(), 'HH:mm')
  if (!candidate || candidate.status === 'cancelled' || candidate.date < today || (candidate.date === today && candidate.time.slice(0, 5) <= nowTime) || candidate.invoice_no || candidate.amount_paid != null) {
    return NextResponse.json({ error: 'Ce lien ne permet plus d\'annuler ce rendez-vous' }, { status: 400 })
  }

  const { data: appointment, error } = await supabase
    .from('appointments').update({ status: 'cancelled' })
    .eq('id', candidate.id).eq('cancel_token', params.token).neq('status', 'cancelled')
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

  await Promise.allSettled(emailTasks)

  return NextResponse.json({ success: true, date: appointment.date, time: appointment.time })
}
