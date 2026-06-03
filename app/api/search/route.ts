import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q     = sanitizeSearchParam(searchParams.get('q'))
  const ville = sanitizeSearchParam(searchParams.get('ville'))

  const supabase = createAdminClient()

  // Filtres DB directs — approved + actif uniquement, pas de limite arbitraire
  let query = supabase
    .from('doctors')
    .select('id, name, specialty, slug, phone, city, appointment_duration, photo_url')
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

  if (error) return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })

  return NextResponse.json(data ?? [], {
    headers: {
      // Cache 60s sur le CDN Vercel — recherches répétées servies instantanément
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}

function sanitizeSearchParam(value: string | null): string {
  return (value ?? '')
    .trim()
    .replace(/[%,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}
