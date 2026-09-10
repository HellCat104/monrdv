// API : mise à jour et suppression d'un RDV
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { sendCancellationEmailToPatient, sendCancellationEmailToDoctor, sendRescheduleEmailToPatient, sendWithTimeout } from '@/lib/email'
import { displayName } from '@/lib/profession'
import { formatDateShort } from '@/lib/utils'
import { proposerCreneauLibere, creneauDuRdv } from '@/lib/waitlist'

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

  // Encaisser est ouvert aux deux forfaits ; seuls les documents comptables
  // (facture, avoir) restent réservés au Cabinet complet.
  if ((amount_paid !== undefined || amount_due !== undefined || payment_method !== undefined)
      && !canAccess(doctor.plan, 'payments')) {
    return NextResponse.json({ error: 'Votre forfait ne permet pas l\'encaissement' }, { status: 403 })
  }

  // `doctor_notes` est une note clinique libre : elle relève du dossier
  // médical, pas de l'agenda. Le contrôle des montants ci-dessus ne la
  // couvrait pas.
  if (doctor_notes !== undefined && !canAccess(doctor.plan, 'records')) {
    return NextResponse.json(
      { error: 'Votre forfait ne permet pas les notes médicales' }, { status: 403 })
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

  // ── Une seule source par encaissement (devis, migration v54) ──
  // Un RDV rattaché à un devis est réglé SUR le devis. Lui laisser en plus son
  // propre amount_paid ferait compter la même somme deux fois dans la caisse,
  // dans les factures et dans le chiffre d'affaires. Le verrou existe aussi en
  // base (trigger forbid_paid_amount_on_quoted_appointment) ; on l'intercepte
  // ici pour renvoyer une phrase lisible plutôt qu'une erreur PostgreSQL.
  if (updates.amount_paid != null) {
    const { data: lien } = await supabase
      .from('appointments').select('quote_id')
      .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
    if (lien?.quote_id) {
      return NextResponse.json({
        error: 'Ce rendez-vous est réglé via le devis : saisissez le versement sur le devis, dans le dossier du patient.',
      }, { status: 409 })
    }
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

  // Liste d'attente : le créneau AVANT l'écriture est relu par la lecture des
  // verrous comptables ci-dessous. Si l'annulation passe, c'est lui qui se
  // libère et qu'on proposera aux patients inscrits (lib/waitlist.ts). `status`
  // sert à ne pas relancer d'offre sur un rendez-vous déjà annulé.
  let avantAnnulation: {
    id: string; doctor_id: string; date: string; time: string; status: string
    duration_minutes: number | null; walk_in: boolean | null
  } | null = null

  // ── Verrous comptables (mêmes règles que la route secrétaire) ──
  // Un acte facturé ne peut plus être annulé ni « dépayé » : la piste comptable
  // doit rester intacte, la correction passe par un avoir.
  if (status === 'cancelled' || updates.amount_paid === null) {
    const { data: cur } = await supabase
      .from('appointments').select('id, doctor_id, invoice_no, status, date, time, duration_minutes, walk_in')
      .eq('id', params.id).eq('doctor_id', doctor.id).single()
    if (status === 'cancelled') avantAnnulation = cur ?? null
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
  let previous: {
    id: string; doctor_id: string; date: string; time: string
    duration_minutes: number | null; walk_in: boolean | null
  } | null = null
  if (isReschedule) {
    const { data: prev } = await supabase.from('appointments')
      .select('id, doctor_id, date, time, duration_minutes, walk_in').eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
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
    await sendWithTimeout(sendRescheduleEmailToPatient({
      patientEmail: appointment.patient.email,
      patientName: `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim(),
      doctorName: displayName(doctor.name, docInfo?.specialty),
      specialty: docInfo?.specialty ?? '',
      oldDate: formatDateShort(previous.date),
      oldTime: previous.time,
      newDate: formatDateShort(appointment.date),
      newTime: appointment.time,
      cancelToken: appointment.cancel_token ?? undefined,
    }), 'déplacement patient')
  }

  // LISTE D'ATTENTE — déplacement. L'ancien créneau est libre : c'est une place
  // comme une autre pour les patients qui attendent. Si le nouveau créneau
  // chevauche l'ancien (10 h → 10 h 15), le contrôle de disponibilité de
  // proposerCreneauLibere le voit occupé et ne propose rien.
  if (isReschedule && previous
      && (previous.date !== appointment.date || String(previous.time).substring(0, 5) !== String(appointment.time).substring(0, 5))) {
    await proposerCreneauLibere(creneauDuRdv('deplacement', previous))
  }

  // LISTE D'ATTENTE — annulation par le médecin. Seulement APRÈS l'écriture
  // vérifiée (`appointment` non nul, statut relu en base) et seulement si le
  // rendez-vous n'était pas déjà annulé : sinon la place était libre avant
  // cette requête et son offre est déjà partie. Lancée tout de suite, attendue
  // plus bas : elle court en même temps que les e-mails d'annulation.
  const offreListeAttente =
    status === 'cancelled' && appointment.status === 'cancelled'
      && avantAnnulation && avantAnnulation.status !== 'cancelled'
      ? proposerCreneauLibere(creneauDuRdv('annulation', avantAnnulation))
      : null

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

  // L'offre de liste d'attente, lancée plus haut en parallèle des e-mails.
  // proposerCreneauLibere ne lève jamais : l'annulation, déjà enregistrée, ne
  // peut pas être rapportée en échec à cause d'elle.
  if (offreListeAttente) await offreListeAttente

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

  // `.select()` renvoie la ligne supprimée : c'est à la fois la preuve que la
  // suppression a touché quelque chose et le créneau qui vient de se libérer.
  const { data: supprimes, error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .select('id, doctor_id, date, time, status, duration_minutes, walk_in')

  if (error) {
    // Le trigger protect_invoiced_appointments bloque la suppression d'un acte
    // déjà facturé : on renvoie un message clair plutôt qu'un 500 générique.
    if (error.message?.includes('facturé')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }
  if (!supprimes || supprimes.length === 0) {
    return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  }

  // LISTE D'ATTENTE — suppression. Aucun écran n'appelle cette méthode
  // aujourd'hui ; si l'un s'y branche demain, la place libérée ne sera pas
  // perdue pour autant. L'inscription du rendez-vous est partie avec lui
  // (ON DELETE CASCADE).
  const supprime = supprimes[0]
  if (supprime.status !== 'cancelled') {
    await proposerCreneauLibere(creneauDuRdv('suppression', supprime))
  }

  return NextResponse.json({ success: true })
}
