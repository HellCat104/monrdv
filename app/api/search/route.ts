import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q')?.trim() || ''
  const ville = searchParams.get('ville')?.trim() || ''

  const supabase = createAdminClient()

  // Filtres DB directs — approved + actif uniquement, pas de limite arbitraire
  let query = supabase
    .from('doctors')
    .select('id, name, specialty, slug, phone, city, appointment_duration')
    .eq('status', 'approved')
    .eq('subscription_status', 'actif')
    .order('name', { ascending: true })
    .limit(50) // 50 résultats max affichés, filtres déjà appliqués côté DB

  if (q) {
    query = query.or(`name.ilike.%${q}%,specialty.ilike.%${q}%`)
  }

  if (ville) {
    query = query.ilike('city', `%${ville}%`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [], {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
