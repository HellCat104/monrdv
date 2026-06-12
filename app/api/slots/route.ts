// API : créneaux horaires disponibles pour une date donnée.
// Supporte les motifs de consultation à durée variable (?type=<consultation_type_id>).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSlotsForDuration, getDayKey, getDayBreaks, type OccupiedInterval } from '@/lib/utils'
import { parseISO } from 'date-fns'

// GET /api/slots?doctor_id=...&date=YYYY-MM-DD[&type=<uuid>]
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  const date = searchParams.get('date')
  const typeId = searchParams.get('type')

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

  // Durée du RDV : celle du motif choisi, sinon la durée de base du médecin
  let duration = doctor.appointment_duration
  if (typeId) {
    const { data: ctype } = await supabase
      .from('consultation_types')
      .select('duration_minutes')
      .eq('id', typeId)
      .eq('doctor_id', doctorId)
      .eq('active', true)
      .maybeSingle()
    if (ctype?.duration_minutes) duration = ctype.duration_minutes
  }

  // Requêtes 2 & 3 en parallèle — dates bloquées + RDV existants (avec leurs durées)
  const [blockedResult, bookedResult] = await Promise.all([
    supabase
      .from('blocked_dates')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .maybeSingle(),
    supabase
      .from('appointments')
      .select('time, duration_minutes')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .neq('status', 'cancelled'),
  ])

  if (blockedResult.data) {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  // Chaque RDV existant occupe [time, time + sa durée) — durée de base si absente
  const occupied: OccupiedInterval[] = (bookedResult.data ?? []).map((b) => ({
    time: b.time.substring(0, 5),
    duration: b.duration_minutes || doctor.appointment_duration,
  }))

  const slots = getSlotsForDuration(
    daySchedule.start,
    daySchedule.end,
    duration,
    doctor.appointment_duration,
    getDayBreaks(daySchedule),
    occupied
  )

  return NextResponse.json({ slots }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
