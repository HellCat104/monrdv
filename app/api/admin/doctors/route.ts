// GET /api/admin/doctors — liste tous les médecins (admin seulement, bypass RLS)
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  // Vérifie que c'est bien l'admin connecté
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // 'pending' | 'approved' | 'rejected' | null (= tous)

  const adminDb = createAdminClient()

  let query = adminDb
    .from('doctors')
    .select('id, name, email, specialty, phone, slug, status, subscription_status, date_expiration, document_url, rejection_reason, created_at')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
