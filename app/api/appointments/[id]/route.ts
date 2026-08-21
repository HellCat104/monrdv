// API : mise à jour et suppression d'un RDV
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { sendCancellationEmailToPatient, sendCancellationEmailToDoctor, sendRescheduleEmailToPatient } from '@/lib/email'
import { displayName } from '@/lib/profession'
import { formatDateShort } from '@/lib/utils'

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

  if (!status && date === undefined && time === undefined
      && doctor_notes === undefined && attendance === undefined
      && amount_paid === undefined && amount_due === undefined && payment_method === undefined) {
    return NextResponse.json({ error: 'Paramètre manquant' }, { status: 400 })
  }

  // Déplacement d'un RDV : formats validés ici, le chevauchement est bloqué par
  // la contrainte d'exclusion en base (remontée en 409 plus bas).
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return NextResponse.json({ error: 'Format de date invalide' }, { status: 400 })
  }
  if (time !== undefined && !/^\d{2}:\d{2}$/.test(String(time))) {
    return NextResponse.json({ error: 'Format d\'heure invalide' }, { status: 400 })
  }

  // Vérifie que le RDV appartient bien au médecin connecté
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, plan')
    .eq('email', user.email)
    .single()

  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  // Encaissement : réservé au forfait Cabinet complet
  if ((amount_paid !== undefined || amount_due !== undefined || payment_method !== undefined)
      && !canAccess(doctor.plan, 'billing')) {
    return NextResponse.json({ error: 'La facturation nécessite le forfait Cabinet complet' }, { status: 403 })
  }

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

  // ── Verrous comptables (mêmes règles que la route secrétaire) ──
  // Un acte facturé ne peut plus être annulé ni « dépayé » : la piste comptable
  // doit rester intacte, la correction passe par un avoir.
  if (status === 'cancelled' || updates.amount_paid === null) {
    const { data: cur } = await supabase
      .from('appointments').select('invoice_no')
      .eq('id', params.id).eq('doctor_id', doctor.id).single()
    if (cur?.invoice_no) {
      return NextResponse.json({
        error: status === 'cancelled'
          ? `Ce rendez-vous est facturé (${cur.invoice_no}) : émettez un avoir au lieu de l'annuler.`
          : `Cet acte est facturé (${cur.invoice_no}) : émettez un avoir au lieu d'annuler le paiement.`,
      }, { status: 409 })
    }
  }

  // Déplacement : on relit l'ancien créneau avant l'écriture, pour pouvoir le
  // rappeler au patient (« ancien » barré / « nouveau » mis en avant).
  const isReschedule = (date !== undefined || time !== undefined) && status !== 'cancelled'
  let previous: { date: string; time: string } | null = null
  if (isReschedule) {
    const { data: prev } = await supabase.from('appointments')
      .select('date, time').eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
    previous = prev ?? null
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

  // Email de déplacement — seulement si le créneau a réellement bougé
  if (isReschedule && previous && appointment.patient?.email
      && (previous.date !== appointment.date || previous.time !== appointment.time)) {
    const { data: docInfo } = await supabase.from('doctors').select('specialty').eq('id', doctor.id).single()
    await sendRescheduleEmailToPatient({
      patientEmail: appointment.patient.email,
      patientName: `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim(),
      doctorName: displayName(doctor.name, docInfo?.specialty),
      specialty: docInfo?.specialty ?? '',
      oldDate: formatDateShort(previous.date),
      oldTime: previous.time,
      newDate: formatDateShort(appointment.date),
      newTime: appointment.time,
      cancelToken: appointment.cancel_token ?? undefined,
    }).catch((err) => console.error('[Email] déplacement patient:', err))
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

  if (error) {
    // Le trigger protect_invoiced_appointments bloque la suppression d'un acte
    // déjà facturé : on renvoie un message clair plutôt qu'un 500 générique.
    if (error.message?.includes('facturé')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
