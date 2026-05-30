// API : annulation de RDV via le lien email
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendCancellationEmailToPatient, sendCancellationEmailToDoctor } from '@/lib/email'

// GET /api/cancel/[token] — annule le RDV et redirige vers une page de confirmation
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createAdminClient()

  const { data: appointment, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('cancel_token', params.token)
    .neq('status', 'cancelled')
    .select('date, time, patient:patients(first_name, last_name, phone, email), doctor:doctors(name, email, specialty)')
    .single()

  if (error || !appointment) {
    const url = new URL('/cancel-result', req.url)
    url.searchParams.set('status', 'error')
    return NextResponse.redirect(url)
  }

  const patient = appointment.patient as any
  const doctor  = appointment.doctor  as any
  const patientName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim()

  // Email de confirmation au patient
  if (patient?.email) {
    sendCancellationEmailToPatient({
      patientEmail: patient.email,
      patientName,
      doctorName:  doctor?.name     ?? '',
      specialty:   doctor?.specialty ?? '',
      date: appointment.date,
      time: appointment.time,
    }).catch((err) => console.error('[Email] annulation patient:', err))
  }

  // Email de notification au médecin
  if (doctor?.email) {
    sendCancellationEmailToDoctor({
      doctorEmail:  doctor.email,
      doctorName:   doctor.name     ?? '',
      patientName,
      patientPhone: patient?.phone  ?? '',
      date: appointment.date,
      time: appointment.time,
    }).catch((err) => console.error('[Email] annulation médecin:', err))
  }

  const url = new URL('/cancel-result', req.url)
  url.searchParams.set('status', 'success')
  url.searchParams.set('date', appointment.date)
  url.searchParams.set('time', appointment.time)
  return NextResponse.redirect(url)
}
