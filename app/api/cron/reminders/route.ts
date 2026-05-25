// Cron job : envoie les rappels SMS 24h avant les RDV
// Déclenché automatiquement par Vercel Cron (voir vercel.json)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendReminderSMS } from '@/lib/twilio'
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
      patient:patients(first_name, last_name, phone),
      doctor:doctors(name)
    `)
    .eq('date', tomorrow)
    .neq('status', 'cancelled')

  if (error) {
    console.error('[Cron reminders] Erreur Supabase:', error)
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }

  let sent = 0
  let failed = 0

  // Envoie les rappels en parallèle (max 10 à la fois)
  const batchSize = 10
  for (let i = 0; i < (appointments ?? []).length; i += batchSize) {
    const batch = appointments!.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map((apt) => {
        if (!apt.patient || !apt.cancel_token) return Promise.resolve(false)
        return sendReminderSMS({
          to: (apt.patient as any).phone,
          patientName: `${(apt.patient as any).first_name} ${(apt.patient as any).last_name}`,
          doctorName: (apt.doctor as any)?.name ?? 'votre médecin',
          date: apt.date,
          time: apt.time,
          cancelToken: apt.cancel_token,
          baseUrl,
        })
      })
    )
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) sent++
      else failed++
    })
  }

  console.log(`[Cron reminders] ${sent} rappels envoyés, ${failed} échoués`)
  return NextResponse.json({ sent, failed, date: tomorrow })
}
