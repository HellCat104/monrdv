import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q          = sanitizeSearchParam(searchParams.get('q'))          // nom du médecin (texte libre)
  const specialite = sanitizeSearchParam(searchParams.get('specialite')) // valeur exacte (liste)
  const ville      = sanitizeSearchParam(searchParams.get('ville'))      // valeur exacte (liste)

  const supabase = createAdminClient()

  // 1) Essaie la fonction RPC (recherche insensible aux accents sur le nom)
  const { data, error } = await supabase.rpc('search_doctors', {
    p_q: q,
    p_specialite: specialite,
    p_ville: ville,
  })

  if (!error) {
    return NextResponse.json(data ?? [], { headers: CACHE })
  }

  // 2) Repli si la fonction n'existe pas encore : recherche classique (toujours fonctionnelle)
  let query = supabase
    .from('doctors')
    .select('id, name, specialty, slug, phone, city, appointment_duration, photo_url')
    .eq('status', 'approved')
    .eq('subscription_status', 'actif')
    .order('name', { ascending: true })
    .limit(50)

  if (specialite) query = query.eq('specialty', specialite)
  if (ville)      query = query.eq('city', ville)
  if (q)          query = query.ilike('name', `%${q}%`)

  const { data: fallbackData, error: fallbackError } = await query

  if (fallbackError) {
    console.error('[Search] fallback error:', fallbackError)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }

  return NextResponse.json(fallbackData ?? [], { headers: CACHE })
}

function sanitizeSearchParam(value: string | null): string {
  return (value ?? '')
    .trim()
    .replace(/[%,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}
