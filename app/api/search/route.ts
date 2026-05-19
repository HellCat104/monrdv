import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.toLowerCase() || ''
  const ville = searchParams.get('ville')?.toLowerCase() || ''

  const supabase = createAdminClient()

  let query = supabase
    .from('doctors')
    .select('id, name, specialty, slug, phone, city, appointment_duration')
    .eq('status', 'approved')
    .eq('subscription_status', 'actif')
    .order('name', { ascending: true })

  if (q) {
    query = query.or(`name.ilike.%${q}%,specialty.ilike.%${q}%`)
  }

  if (ville) {
    query = query.ilike('city', `%${ville}%`)
  }

  const { data, error } = await query.limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
