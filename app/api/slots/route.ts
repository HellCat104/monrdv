// API : créneaux horaires disponibles pour une date donnée
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateTimeSlots, getAvailableSlots, getDayKey } from '@/lib/utils'
import { parseISO } from 'date-fns'

// GET /api/slots?doctor_id=...&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  const date = searchParams.get('date')

  if (!doctorId || !date) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Requête 1 : infos médecin (nécessaire avant les autres pour vérifier le jour)
  const { data: doctor, error: doctorError } = await supabase
    .from('doctors')
    .select('working_hours, appointment_duration')
    .eq('id', doctorId)
    .single()

  if (doctorError || !doctor) {
    return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
  }

  // Vérifie si le jour est ouvert — court-circuit si fermé
  const parsedDate = parseISO(date)
  const dayKey = getDayKey(parsedDate)
  const daySchedule = doctor.working_hours[dayKey]

  if (!daySchedule?.enabled) {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  // Requêtes 2 & 3 en parallèle — dates bloquées + créneaux réservés
  const [blockedResult, bookedResult] = await Promise.all([
    supabase
      .from('blocked_dates')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .maybeSingle(),
    supabase
      .from('appointments')
      .select('time')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .neq('status', 'cancelled'),
  ])

  if (blockedResult.data) {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  const allSlots = generateTimeSlots(
    daySchedule.start,
    daySchedule.end,
    doctor.appointment_duration
  )

  const bookedTimes = (bookedResult.data ?? []).map((b) => b.time.substring(0, 5))
  const slots = getAvailableSlots(allSlots, bookedTimes)

  return NextResponse.json({ slots }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
