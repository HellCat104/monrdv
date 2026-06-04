// Cron job : envoie les rappels email 24h avant le RDV (la veille)
// Déclenché automatiquement par Vercel Cron (voir vercel.json)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendReminderEmailToPatient } from '@/lib/email'
import { format, addDays, startOfDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { MAROC_TZ } from '@/lib/utils'

export async function GET(req: NextRequest) {
  // Vérifie le secret Cron pour éviter les appels non autorisés
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
          ok ? sent++ : failed++
        } catch { failed++ }
      })
    )
  }

  console.log(`[Cron reminders] Email: ${sent} envoyés, ${skipped} ignorés, ${failed} échoués — date: ${targetDate}`)
  return NextResponse.json({ sent, skipped, failed, date: targetDate })
}
