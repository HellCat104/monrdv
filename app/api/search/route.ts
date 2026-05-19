import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.toLowerCase() || ''
  const ville = searchParams.get('ville')?.toLowerCase() || ''

  const supabase = createAdminClient()

  let query = supabase
    .from('doctors')
    .select('id, name, specialty, slug, phone, city, appointment_duration, status, subscription_status')
    .order('name', { ascending: true })

  if (q) {
    query = query.or(`name.ilike.%${q}%,specialty.ilike.%${q}%`)
  }

  if (ville) {
    query = query.ilike('city', `%${ville}%`)
  }

  const { data, error } = await query.limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filtre côté serveur pour être sûr (les filtres Supabase peuvent être mis en cache)
  const filtered = (data ?? [])
    .filter(d => d.status === 'approved' && d.subscription_status === 'actif')
    .map(({ status, subscription_status, ...rest }) => rest) // enlève les champs internes

  return NextResponse.json(filtered, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
