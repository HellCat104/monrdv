// API : mise à jour et suppression d'un RDV
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCancellationSMS } from '@/lib/twilio'
import { formatPhoneMaroc } from '@/lib/utils'

// PATCH /api/appointments/[id] — modifie le statut (confirm/cancel)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { status, date, time } = body

  if (!status) return NextResponse.json({ error: 'Statut manquant' }, { status: 400 })

  // Vérifie que le RDV appartient bien au médecin connecté
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name')
    .eq('email', user.email)
    .single()

  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  const { data: appointment, error } = await supabase
    .from('appointments')
    .update({ status, ...(date ? { date } : {}), ...(time ? { time } : {}) })
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .select('*, patient:patients(*)')
    .single()

  if (error || !appointment) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  }

  // Envoie un SMS d'annulation si le statut devient "cancelled"
  if (status === 'cancelled' && appointment.patient) {
    sendCancellationSMS({
      to: appointment.patient.phone,
      patientName: `${appointment.patient.first_name} ${appointment.patient.last_name}`,
      doctorName: doctor.name,
      date: appointment.date,
      time: appointment.time,
    }).catch((err) => console.error('[SMS annulation]', err))
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
