// GET /api/admin/doctors — liste + compteurs (admin seulement, bypass RLS)
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vérifie que c'est bien l'admin connecté
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status      = searchParams.get('status')  // 'pending' | 'approved' | 'rejected' | null
  const countsOnly  = searchParams.get('counts') === '1'

  const adminDb = createAdminClient()

  // ── Mode compteurs uniquement (3 requêtes count légères) ──────────────────
  if (countsOnly) {
    const [pending, approved, rejected] = await Promise.all([
      adminDb.from('doctors').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      adminDb.from('doctors').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      adminDb.from('doctors').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    ])
    return NextResponse.json({
      pending:  pending.count  ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── Mode liste ────────────────────────────────────────────────────────────
  let query = adminDb
    .from('doctors')
    .select('id, name, email, specialty, phone, slug, status, subscription_status, date_expiration, cnom_number, rejection_reason, created_at, plan, pending_plan, referral_code')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
  }

  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } })
}
