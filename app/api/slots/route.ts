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

  // Récupère les infos du médecin (horaires + durée)
  const { data: doctor, error: doctorError } = await supabase
    .from('doctors')
    .select('working_hours, appointment_duration')
    .eq('id', doctorId)
    .single()

  if (doctorError || !doctor) {
    return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
  }

  // Vérifie si le jour est ouvert
  const parsedDate = parseISO(date)
  const dayKey = getDayKey(parsedDate)
  const daySchedule = doctor.working_hours[dayKey]

  if (!daySchedule?.enabled) {
    return NextResponse.json({ slots: [] })
  }

  // Génère tous les créneaux du jour
  const allSlots = generateTimeSlots(
    daySchedule.start,
    daySchedule.end,
    doctor.appointment_duration
  )

  // Récupère les créneaux déjà réservés
  const { data: booked } = await supabase
    .from('appointments')
    .select('time')
    .eq('doctor_id', doctorId)
    .eq('date', date)
    .neq('status', 'cancelled')

  const bookedTimes = (booked ?? []).map((b) => b.time.substring(0, 5))

  // Construit la liste avec disponibilité
  const slots = getAvailableSlots(allSlots, bookedTimes)

  return NextResponse.json({ slots })
}
