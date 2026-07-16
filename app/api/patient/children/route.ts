// API : enfants rattachés au compte parent connecté (fiches is_child, tous
// médecins confondus, dédupliquées) — pré-remplit « pour mon enfant ».
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('patients')
    .select('first_name, last_name, birth_date, sex')
    .eq('user_id', user.id)
    .eq('is_child', true)
    .order('created_at', { ascending: true })

  // Déduplique (même enfant chez plusieurs médecins)
  const seen = new Set<string>()
  const children = (data ?? []).filter((c) => {
    const k = `${c.first_name.toLowerCase()}|${c.last_name.toLowerCase()}|${c.birth_date ?? ''}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return NextResponse.json({ children })
}
