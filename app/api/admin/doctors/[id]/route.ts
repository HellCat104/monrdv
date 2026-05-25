// API Admin : approuver ou refuser un médecin
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendApprovalEmail, sendRejectionEmail } from '@/lib/email'

// PATCH /api/admin/doctors/[id] — approve ou reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Vérifie que c'est bien l'admin connecté
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json()
  const { action, rejection_reason, date_expiration } = body
  // action: 'approve' | 'reject' | 'toggle_subscription' | 'set_expiration'

  if (!['approve', 'reject', 'toggle_subscription', 'set_expiration', 'extend_subscription'].includes(action)) {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  }

  const adminDb = createAdminClient()

  // ── Toggle abonnement actif/inactif ──────────────────────────────────────
  if (action === 'toggle_subscription') {
    const { data: current, error: fetchErr } = await adminDb
      .from('doctors')
      .select('subscription_status')
      .eq('id', params.id)
      .single()

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
    }

    const newSubStatus = current.subscription_status === 'actif' ? 'inactif' : 'actif'
    const { error: updateErr } = await adminDb
      .from('doctors')
      .update({ subscription_status: newSubStatus })
      .eq('id', params.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, subscription_status: newSubStatus })
  }

  // ── Modifier la date d'expiration ────────────────────────────────────────
  if (action === 'set_expiration') {
    const { error: updateErr } = await adminDb
      .from('doctors')
      .update({ date_expiration: date_expiration ?? null })
      .eq('id', params.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // ── Renouveler abonnement +30j ───────────────────────────────────────────
  if (action === 'extend_subscription') {
    const { data: current } = await adminDb
      .from('doctors')
      .select('date_expiration')
      .eq('id', params.id)
      .single()

    const base = current?.date_expiration
      ? new Date(current.date_expiration)
      : new Date()
    if (base < new Date()) base.setTime(new Date().getTime())
    base.setDate(base.getDate() + 30)
    const newExpiry = base.toISOString().split('T')[0]

    const { error } = await adminDb
      .from('doctors')
      .update({ date_expiration: newExpiry, subscription_status: 'actif' })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })
    return NextResponse.json({ success: true, date_expiration: newExpiry })
  }

  // ── Approuver / Refuser ──────────────────────────────────────────────────
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  // 1. Récupère d'abord le médecin pour vérifier qu'il existe
  const { data: existing, error: fetchError } = await adminDb
    .from('doctors')
    .select('id, name, email')
    .eq('id', params.id)
    .single()

  if (fetchError || !existing) {
    console.error('[Admin PATCH] fetch error:', fetchError)
    return NextResponse.json({ error: `Médecin introuvable (id: ${params.id})` }, { status: 404 })
  }

  // 2. Met à jour le statut + 30 jours gratuits si approbation
  const updatePayload: Record<string, string> = { status: newStatus }
  if (rejection_reason) updatePayload.rejection_reason = rejection_reason
  if (action === 'approve') {
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 30)
    updatePayload.date_expiration = expiry.toISOString().split('T')[0]
    updatePayload.subscription_status = 'actif'
  }

  const { error: updateError } = await adminDb
    .from('doctors')
    .update(updatePayload)
    .eq('id', params.id)

  if (updateError) {
    console.error('[Admin PATCH] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 3. Envoie l'email au médecin
  if (action === 'approve') {
    sendApprovalEmail({ to: existing.email, doctorName: existing.name })
      .catch((err) => console.error('[Email approbation]', err))
  } else {
    sendRejectionEmail({
      to: existing.email,
      doctorName: existing.name,
      reason: rejection_reason,
    }).catch((err) => console.error('[Email refus]', err))
  }

  return NextResponse.json({ success: true, status: newStatus })
}
