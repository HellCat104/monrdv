// Cron job : envoie les rappels email 24h avant le RDV (la veille)
// Déclenché automatiquement par Vercel Cron (voir vercel.json)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendReminderEmailToPatient, sendRecallEmailToPatient } from '@/lib/email'
import { format, addDays, startOfDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { MAROC_TZ } from '@/lib/utils'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma'

export async function GET(req: NextRequest) {
  // Vérifie le secret Cron pour éviter les appels non autorisés
  const authHeader = req.headers.get('authorization')
  // Sans secret configuré, la comparaison portait sur « Bearer undefined » —
  // la première valeur qu'un attaquant essaie. On refuse explicitement.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron] CRON_SECRET absent : appel refusé')
    return NextResponse.json({ error: 'Cron non configuré' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Rappel envoyé la VEILLE : on cible les RDV de DEMAIN au Maroc
  const nowMaroc = toZonedTime(new Date(), MAROC_TZ)
  const todayStart = startOfDay(nowMaroc)
  const targetDate = format(addDays(nowMaroc, 1), 'yyyy-MM-dd')

  // Récupère tous les RDV de demain non annulés avec email patient
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id, date, time, cancel_token, created_at,
      patient:patients(first_name, last_name, email),
      doctor:doctors(name, specialty)
    `)
    .eq('date', targetDate)
    .neq('status', 'cancelled')
    .is('reminder_sent_at', null)   // idempotence : ne jamais renvoyer un rappel déjà envoyé

  if (error) {
    console.error('[Cron reminders] Erreur Supabase:', error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }

  let sent = 0, skipped = 0, failed = 0

  const batchSize = 10
  for (let i = 0; i < (appointments ?? []).length; i += batchSize) {
    const batch = appointments!.slice(i, i + batchSize)

    await Promise.allSettled(
      batch.map(async (apt) => {
        const patient = apt.patient as any
        const doctor  = apt.doctor  as any

        // Skip si pas d'email patient
        if (!patient?.email) { skipped++; return }

        // Skip si RDV pris aujourd'hui (le patient vient de recevoir sa confirmation)
        const createdAtMaroc = toZonedTime(new Date(apt.created_at), MAROC_TZ)
        if (createdAtMaroc >= todayStart) { skipped++; return }

        const patientName = `${patient.first_name} ${patient.last_name}`
        const doctorName  = doctor?.name    ?? 'votre médecin'
        const specialty   = doctor?.specialty ?? ''

        try {
          const ok = await sendReminderEmailToPatient({
            patientEmail: patient.email,
            patientName,
            doctorName,
            specialty,
            date: apt.date,
            time: apt.time,
            cancelToken: apt.cancel_token,
          })
          if (ok) {
            // Marque l'envoi pour qu'un rejeu du cron ne renvoie pas l'email
            await supabase.from('appointments')
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq('id', apt.id)
            sent++
          } else { failed++ }
        } catch { failed++ }
      })
    )
  }

  console.log(`[Cron reminders] Email: ${sent} envoyés, ${skipped} ignorés, ${failed} échoués — date: ${targetDate}`)

  // ── Rappels de suivi ("revenez dans X mois") arrivés à échéance ───────────
  const today = format(nowMaroc, 'yyyy-MM-dd')
  let recallSent = 0, recallSkipped = 0, recallFailed = 0

  const { data: recalls } = await supabase
    .from('recalls')
    .select(`
      id, reason,
      patient:patients(first_name, last_name, email),
      doctor:doctors(name, specialty, slug)
    `)
    .eq('status', 'pending')
    .lte('due_date', today)

  for (let i = 0; i < (recalls ?? []).length; i += batchSize) {
    const batch = recalls!.slice(i, i + batchSize)
    await Promise.allSettled(
      batch.map(async (rec) => {
        const patient = rec.patient as any
        const doctor  = rec.doctor  as any
        if (!patient?.email || !doctor?.slug) {
          // Pas d'email : on marque quand même traité pour ne pas boucler
          await supabase.from('recalls').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', rec.id)
          recallSkipped++; return
        }
        try {
          const ok = await sendRecallEmailToPatient({
            patientEmail: patient.email,
            patientName: `${patient.first_name} ${patient.last_name}`,
            doctorName: doctor.name ?? 'votre médecin',
            specialty: doctor.specialty ?? '',
            reason: rec.reason,
            bookingUrl: `${APP_URL}/dr-${doctor.slug}`,
          })
          if (ok) {
            await supabase.from('recalls').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', rec.id)
            recallSent++
          } else { recallFailed++ }
        } catch { recallFailed++ }
      })
    )
  }

  console.log(`[Cron recalls] ${recallSent} envoyés, ${recallSkipped} sans email, ${recallFailed} échoués`)

  return NextResponse.json({
    reminders: { sent, skipped, failed, date: targetDate },
    recalls: { sent: recallSent, skipped: recallSkipped, failed: recallFailed },
  })
}
