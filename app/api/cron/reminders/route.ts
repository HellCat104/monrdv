// Cron job : envoie les rappels SMS + Email 24h avant les RDV
// Déclenché automatiquement par Vercel Cron (voir vercel.json)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendReminderSMS } from '@/lib/twilio'
import { sendReminderEmailToPatient } from '@/lib/email'
import { format, addDays } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { MAROC_TZ } from '@/lib/utils'

export async function POST(req: NextRequest) {
  // Vérifie le secret Cron pour éviter les appels non autorisés
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Date de demain au Maroc
  const tomorrow = format(addDays(toZonedTime(new Date(), MAROC_TZ), 1), 'yyyy-MM-dd')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''

  // Récupère tous les RDV de demain non annulés
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id, date, time, cancel_token,
      patient:patients(first_name, last_name, phone, email),
      doctor:doctors(name, specialty)
    `)
    .eq('date', tomorrow)
    .neq('status', 'cancelled')

  if (error) {
    console.error('[Cron reminders] Erreur Supabase:', error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }

  let smsSent = 0, smsFailed = 0
  let emailSent = 0, emailFailed = 0

  const batchSize = 10
  for (let i = 0; i < (appointments ?? []).length; i += batchSize) {
    const batch = appointments!.slice(i, i + batchSize)

    await Promise.allSettled(
      batch.map(async (apt) => {
        if (!apt.patient || !apt.cancel_token) return

        const patient     = apt.patient as any
        const doctor      = apt.doctor  as any
        const patientName = `${patient.first_name} ${patient.last_name}`
        const doctorName  = doctor?.name ?? 'votre médecin'

        // ── SMS ──────────────────────────────────────────────────────────
        try {
          const ok = await sendReminderSMS({
            to: patient.phone,
            patientName,
            doctorName,
            date: apt.date,
            time: apt.time,
            cancelToken: apt.cancel_token,
            baseUrl,
          })
          ok ? smsSent++ : smsFailed++
        } catch { smsFailed++ }

        // ── Email (si le patient a un email) ─────────────────────────────
        if (patient.email) {
          try {
            const ok = await sendReminderEmailToPatient({
              patientEmail: patient.email,
              patientName,
              doctorName,
              specialty: doctor?.specialty ?? '',
              date: apt.date,
              time: apt.time,
              cancelToken: apt.cancel_token,
            })
            ok ? emailSent++ : emailFailed++
          } catch { emailFailed++ }
        }
      })
    )
  }

  console.log(`[Cron reminders] SMS: ${smsSent} envoyés, ${smsFailed} échoués — Email: ${emailSent} envoyés, ${emailFailed} échoués`)
  return NextResponse.json({ smsSent, smsFailed, emailSent, emailFailed, date: tomorrow })
}
