// API : dates bloquées (congés) d'un médecin — pour la page de réservation publique
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { formatInTimeZone } from 'date-fns-tz'

// GET /api/blocked-dates?doctor_id=...
// Retourne les dates bloquées (pour griser le calendrier) + les messages
// publics laissés par le médecin pour ses congés à venir.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  if (!doctorId) return NextResponse.json({ error: 'doctor_id manquant' }, { status: 400 })

  const supabase = createAdminClient()

  // Vérifie que le médecin existe et est approuvé
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('id', doctorId)
    .eq('status', 'approved')
    .single()

  if (!doctor) return NextResponse.json({ blocked: [], notices: [] })

  const { data } = await supabase
    .from('blocked_dates')
    .select('date, reason, start_time')
    .eq('doctor_id', doctorId)

  const rows = (data ?? []) as { date: string; reason: string | null; start_time: string | null }[]

  // Seul un congé (blocage sans horaire) ferme la journée. Un blocage d'une
  // heure laisse le jour réservable : /api/slots en retire juste l'intervalle.
  const conges = rows.filter((d) => !d.start_time)
  const blocked = conges.map((d) => d.date)

  // Messages publics des congés à VENIR (aujourd'hui inclus), heure Maroc
  const today = formatInTimeZone(new Date(), 'Africa/Casablanca', 'yyyy-MM-dd')
  const notices = Array.from(
    new Set(
      conges
        .filter((d) => d.date >= today && d.reason && d.reason.trim())
        .map((d) => d.reason!.trim())
    )
  )

  return NextResponse.json({ blocked, notices })
}
