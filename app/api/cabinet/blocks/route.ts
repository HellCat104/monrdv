// Blocage de créneau côté secrétaire (permission « Gérer les rendez-vous »).
// Synchronisé avec le médecin et le public (même table blocked_dates).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

// GET ?date=YYYY-MM-DD — blocages du jour
export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const date = req.nextUrl.searchParams.get('date') || format(getNowInMaroc(), 'yyyy-MM-dd')
  const admin = createAdminClient()
  const { data } = await admin.from('blocked_dates')
    .select('id, date, start_time, end_time, reason')
    .eq('doctor_id', ctx.doctor.id).eq('date', date).order('start_time', { ascending: true })
  return NextResponse.json({ blocks: data ?? [] })
}

// POST — crée un blocage (plage horaire ou journée entière)
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.manage_appointments) return NextResponse.json({ error: 'Permission manquante (gestion des RDV)' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const date = String(body.date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  if (date < format(getNowInMaroc(), 'yyyy-MM-dd')) return NextResponse.json({ error: 'Impossible de bloquer dans le passé' }, { status: 400 })

  const fullDay = body.full_day === true
  let start: string | null = null, end: string | null = null
  if (!fullDay) {
    start = String(body.start_time ?? ''); end = String(body.end_time ?? '')
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
      return NextResponse.json({ error: 'Plage horaire invalide' }, { status: 400 })
    }
  }
  const reason = body.reason ? String(body.reason).slice(0, 200) : null

  const admin = createAdminClient()
  const { data, error } = await admin.from('blocked_dates')
    .insert({ doctor_id: ctx.doctor.id, date, start_time: start, end_time: end, reason })
    .select('id, date, start_time, end_time, reason').single()
  if (error || !data) return NextResponse.json({ error: 'Échec du blocage' }, { status: 500 })
  return NextResponse.json({ block: data }, { status: 201 })
}

// DELETE ?id= — supprime un blocage
export async function DELETE(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.manage_appointments) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'Blocage manquant' }, { status: 400 })
  const admin = createAdminClient()
  const { error } = await admin.from('blocked_dates').delete().eq('id', id).eq('doctor_id', ctx.doctor.id)
  if (error) return NextResponse.json({ error: 'Échec' }, { status: 500 })
  return NextResponse.json({ success: true })
}
