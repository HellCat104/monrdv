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
  const { status, date, time, doctor_notes, attendance, amount_paid, amount_due, payment_method } = body

  if (!status && doctor_notes === undefined && attendance === undefined
      && amount_paid === undefined && amount_due === undefined && payment_method === undefined) {
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
  if (attendance !== undefined) {
    const allowedAtt = ['present', 'absent', 'late']
    updates.attendance = attendance && allowedAtt.includes(attendance) ? attendance : null
  }
  // Paiement : montant encaissé (null = marquer comme non payé)
  if (amount_paid !== undefined) {
    const amount = amount_paid === null ? null : Number(amount_paid)
    if (amount !== null && (isNaN(amount) || amount < 0 || amount > 100000)) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
    }
    updates.amount_paid = amount
    updates.paid_at = amount !== null ? new Date().toISOString() : null
    // Le n° de facture séquentiel est attribué automatiquement par le trigger
    // assign_invoice_no() en base, dans la même transaction (sans trou).
  }
  // Montant total dû (pour les paiements partiels)
  if (amount_due !== undefined) {
    const due = amount_due === null ? null : Number(amount_due)
    if (due !== null && (isNaN(due) || due < 0 || due > 100000)) {
      return NextResponse.json({ error: 'Montant total invalide' }, { status: 400 })
    }
    updates.amount_due = due
  }
  // Mode de règlement
  if (payment_method !== undefined) {
    const allowed = ['especes', 'carte', 'cheque', 'virement']
    updates.payment_method = payment_method && allowed.includes(payment_method) ? payment_method : null
  }

  // Cohérence comptable : le montant payé ne peut pas dépasser le montant dû.
  if (updates.amount_paid != null) {
    let effectiveDue: number | null
    if (amount_due !== undefined) {
      effectiveDue = updates.amount_due as number | null
    } else {
      const { data: cur } = await supabase
        .from('appointments').select('amount_due')
        .eq('id', params.id).eq('doctor_id', doctor.id).single()
      effectiveDue = (cur?.amount_due as number | null) ?? null
    }
    if (effectiveDue != null && (updates.amount_paid as number) > effectiveDue) {
      return NextResponse.json({ error: 'Le montant payé dépasse le montant dû' }, { status: 400 })
    }
  }

  const { data: appointment, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .select('*, patient:patients(*)')
    .single()

  if (error || !appointment) {
    // 23505 / 23P01 : le nouveau créneau (reprogrammation) entre en collision
    // avec un RDV existant — index unique ou contrainte d'exclusion.
    if (error?.code === '23505' || error?.code === '23P01') {
      return NextResponse.json({ error: 'Ce créneau chevauche un rendez-vous existant' }, { status: 409 })
    }
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
