// API : dates bloquées (congés) d'un médecin — pour la page de réservation publique
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/blocked-dates?doctor_id=...
// Retourne uniquement les JOURS entièrement bloqués. Les blocages horaires sont
// traités par /api/slots; aucun motif interne n'est exposé publiquement.
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

  if (!doctor) return NextResponse.json({ blocked: [] })

  const { data } = await supabase
    .from('blocked_dates')
    .select('date, start_time, end_time')
    .eq('doctor_id', doctorId)

  const rows = (data ?? []) as { date: string; start_time: string | null; end_time: string | null }[]
  const blocked = rows.filter((d) => !d.start_time && !d.end_time).map((d) => d.date)
  return NextResponse.json({ blocked })
}
