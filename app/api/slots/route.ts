// API : créneaux horaires disponibles pour une date donnée.
// Supporte les motifs de consultation à durée variable (?type=<consultation_type_id>).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSlotsForDuration, getDayKey, getDayBreaks, getNowInMaroc, toMinutes, isFullDayBlocked, DEFAULT_LEAD_HOURS, blockedIntervals, type OccupiedInterval } from '@/lib/utils'
import { parseISO, format } from 'date-fns'

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
    .select('working_hours, appointment_duration, status, subscription_status, booking_lead_hours')
    .eq('id', doctorId)
    .single()

  if (doctorError || !doctor) {
    return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
  }

  // Médecin non réservable (non approuvé ou abonnement inactif) : aucun créneau.
  // Évite d'afficher des disponibilités que la création de RDV refusera ensuite.
  if (doctor.status !== 'approved' || doctor.subscription_status !== 'actif') {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  const leadHours = doctor.booking_lead_hours ?? DEFAULT_LEAD_HOURS

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

  // Requêtes 2 & 3 en parallèle — blocages (jour entier ou plages) + RDV existants
  const [blockedResult, bookedResult] = await Promise.all([
    supabase
      .from('blocked_dates')
      .select('start_time, end_time')
      .eq('doctor_id', doctorId)
      .eq('date', date),
    supabase
      .from('appointments')
      .select('time, duration_minutes')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .neq('status', 'cancelled'),
  ])

  const blocks = blockedResult.data ?? []
  // Un blocage sans horaire = journée entière fermée
  if (isFullDayBlocked(blocks)) {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  // Chaque RDV existant occupe [time, time + sa durée) — durée de base si absente
  const occupied: OccupiedInterval[] = [...blockedIntervals(blocks), ...(bookedResult.data ?? []).map((b) => ({
    time: b.time.substring(0, 5),
    duration: b.duration_minutes || doctor.appointment_duration,
  }))]

  let slots = getSlotsForDuration(
    daySchedule.start,
    daySchedule.end,
    duration,
    doctor.appointment_duration,
    getDayBreaks(daySchedule),
    occupied
  )

  // Pour la journée en cours (heure marocaine), les heures déjà passées
  // ne sont plus proposées (utile au cabinet : RDV du jour même).
  const nowMaroc = getNowInMaroc()
  // Le jour même, on ne propose que ce qui laisse au médecin son délai de
  // prévenance : un patient ne doit pas pouvoir surgir dans dix minutes.
  if (date === format(nowMaroc, 'yyyy-MM-dd')) {
    const cutoff = toMinutes(format(nowMaroc, 'HH:mm')) + leadHours * 60
    slots = slots.map((s) => (toMinutes(s.time) < cutoff ? { ...s, available: false } : s))
  }

  return NextResponse.json({ slots }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
