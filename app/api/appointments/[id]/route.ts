// API : mise à jour et suppression d'un RDV
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCancellationEmailToPatient, sendCancellationEmailToDoctor } from '@/lib/email'

// PATCH /api/appointments/[id] — modifie le statut (confirm/cancel)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { status, date, time, doctor_notes, attendance } = body

  if (!status && doctor_notes === undefined && attendance === undefined) {
    return NextResponse.json({ error: 'Paramètre manquant' }, { status: 400 })
  }

  // Vérifie que le RDV appartient bien au médecin connecté
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name')
    .eq('email', user.email)
    .single()

  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (status)              updates.status       = status
  if (date)                updates.date         = date
  if (time)                updates.time         = time
  if (doctor_notes !== undefined) updates.doctor_notes = doctor_notes || null
  if (attendance !== undefined)   updates.attendance   = attendance

  const { data: appointment, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .select('*, patient:patients(*)')
    .single()

  if (error || !appointment) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  }

  // Emails d'annulation si le statut devient "cancelled"
  if (status === 'cancelled' && appointment.patient) {
    const patientName = `${appointment.patient.first_name} ${appointment.patient.last_name}`
    const { data: doctorFull } = await supabase.from('doctors').select('email, specialty').eq('id', doctor.id).single()

    // AWAIT obligatoire en serverless (sinon tués avant l'envoi)
    const emailTasks: Promise<unknown>[] = []

    if (appointment.patient.email) {
      emailTasks.push(
        sendCancellationEmailToPatient({
          patientEmail: appointment.patient.email,
          patientName,
          doctorName: doctor.name,
          specialty: doctorFull?.specialty ?? '',
          date: appointment.date,
          time: appointment.time,
        }).catch((err) => console.error('[Email] annulation patient:', err))
      )
    }

    if (doctorFull?.email) {
      emailTasks.push(
        sendCancellationEmailToDoctor({
          doctorEmail: doctorFull.email,
          doctorName: doctor.name,
          patientName,
          patientPhone: appointment.patient.phone,
          date: appointment.date,
          time: appointment.time,
        }).catch((err) => console.error('[Email] annulation médecin:', err))
      )
    }

    await Promise.allSettled(emailTasks)
  }

  return NextResponse.json(appointment)
}

// DELETE /api/appointments/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)

  if (error) return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })

  return NextResponse.json({ success: true })
}
