// Cron job : envoie l'agenda du jour à chaque médecin actif chaque matin
// Déclenché par Vercel Cron (voir vercel.json) — tous les jours à 7h
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendDailyAgendaToDoctor } from '@/lib/email'
import { format, addDays } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { MAROC_TZ } from '@/lib/utils'
import type { WorkingHours } from '@/types'

// Correspondance JS day (0=dim, 1=lun...) → clé WorkingHours
const JS_DAY_TO_KEY: Record<number, keyof WorkingHours> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Date d'aujourd'hui au Maroc
  const nowMaroc  = toZonedTime(new Date(), MAROC_TZ)
  const today     = format(nowMaroc, 'yyyy-MM-dd')
  const dayKey    = JS_DAY_TO_KEY[nowMaroc.getDay()]

  // Récupère tous les médecins actifs avec leur email et horaires
  const { data: doctors, error } = await supabase
    .from('doctors')
    .select('id, name, email, working_hours')
    .eq('status', 'approved')
    .eq('subscription_status', 'actif')

  if (error || !doctors) {
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }

  let sent = 0, skipped = 0, failed = 0

  for (const doctor of doctors) {
    // Skip si le jour est désactivé dans ses horaires
    const wh = doctor.working_hours as WorkingHours | null
    if (wh && wh[dayKey] && !wh[dayKey].enabled) {
      skipped++
      continue
    }

    // Récupère les RDV du jour pour ce médecin
    const { data: appointments } = await supabase
      .from('appointments')
      .select('time, notes, patient:patients(first_name, last_name, phone)')
      .eq('doctor_id', doctor.id)
      .eq('date', today)
      .neq('status', 'cancelled')
      .order('time', { ascending: true })

    const formattedApts = (appointments ?? []).map((apt) => ({
      time:        apt.time,
      patientName: `${(apt.patient as any)?.first_name ?? ''} ${(apt.patient as any)?.last_name ?? ''}`.trim(),
      phone:       (apt.patient as any)?.phone ?? '',
      notes:       apt.notes,
    }))

    // Formate la date en français
    const dateFormatted = format(nowMaroc, 'dd/MM/yyyy')

    const ok = await sendDailyAgendaToDoctor({
      doctorEmail:  doctor.email,
      doctorName:   doctor.name,
      date:         dateFormatted,
      appointments: formattedApts,
    })

    ok ? sent++ : failed++
  }

  console.log(`[Cron agenda] ${sent} envoyés, ${skipped} ignorés (jour off), ${failed} échoués`)
  return NextResponse.json({ sent, skipped, failed, date: today })
}
