// API : recherche publique de médecins
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/search?q=Hassan&ville=Casablanca
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.toLowerCase() || ''
  const ville = searchParams.get('ville')?.toLowerCase() || ''

  const supabase = createAdminClient()

  let query = supabase
    .from('doctors')
    .select('id, name, specialty, slug, phone, appointment_duration')
    .order('name', { ascending: true })

  // Filtre par nom ou spécialité
  if (q) {
    query = query.or(`name.ilike.%${q}%,specialty.ilike.%${q}%`)
  }

  const { data, error } = await query.limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
