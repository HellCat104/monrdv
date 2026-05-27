// API : gestion des dates bloquées par le médecin
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/blocked-dates?doctor_id=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  if (!doctorId) return NextResponse.json({ error: 'doctor_id manquant' }, { status: 400 })

  const supabase = createClient()
  const { data } = await supabase
    .from('blocked_dates')
    .select('date')
    .eq('doctor_id', doctorId)

  return NextResponse.json({ blocked: (data ?? []).map((d: { date: string }) => d.date) })
}
