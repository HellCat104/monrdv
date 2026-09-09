// API devis — détail, modification (libellé, notes, statut) et suppression.
// Médecin propriétaire uniquement (voir app/api/quotes/route.ts).
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, loadOwnedQuote, quoteNotFound } from '@/lib/devis-server'
import type { QuoteStatus } from '@/types'

export const dynamic = 'force-dynamic'

const STATUSES: QuoteStatus[] = ['brouillon', 'propose', 'accepte', 'refuse', 'termine', 'annule']

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data } = await supabase
    .from('quotes')
    .select('*, items:quote_items(*), payments:quote_payments(*), installments:quote_installments(*)')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()

  if (!data) return quoteNotFound()
  return NextResponse.json(data)
}

// PATCH — libellé, notes, statut.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.label !== undefined) updates.label = body.label ? String(body.label).slice(0, 120) : null
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).slice(0, 2000) : null

  if (body.status !== undefined) {
    const status = String(body.status) as QuoteStatus
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }
    // Un devis déjà encaissé ne peut pas être annulé ni refusé : l'argent reçu,
    // lui, ne disparaît pas. Le classer « annulé » laisserait des versements
    // rattachés à un devis qui prétend n'avoir jamais existé, et le fiduciaire
    // se retrouverait avec des factures orphelines.
    if (status === 'annule' || status === 'refuse') {
      const { count } = await supabase
        .from('quote_payments').select('id', { count: 'exact', head: true })
        .eq('quote_id', quote.id).eq('doctor_id', doctor.id)
      if ((count ?? 0) > 0) {
        return NextResponse.json({
          error: 'Ce devis a déjà reçu des versements : il ne peut plus être annulé ni refusé.',
        }, { status: 409 })
      }
    }
    updates.status = status
    // Horodatage des étapes, posé une seule fois (un aller-retour
    // proposé → accepté → proposé ne doit pas réécrire la date d'origine).
    if (status === 'propose') updates.proposed_at = new Date().toISOString()
    if (status === 'accepte') updates.accepted_at = new Date().toISOString()
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('quotes').update(updates)
    .eq('id', quote.id).eq('doctor_id', doctor.id)
    .select('*, items:quote_items(*), payments:quote_payments(*), installments:quote_installments(*)')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — suppression complète (lignes et échéancier partent en cascade).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  // Un devis qui a encaissé n'est plus un brouillon : le supprimer emporterait
  // ses versements (ON DELETE CASCADE) et donc des factures déjà numérotées,
  // ce qui ouvrirait un trou dans la séquence. On refuse ici plutôt que de
  // laisser le trigger de protection remonter une erreur base illisible.
  const { count } = await supabase
    .from('quote_payments').select('id', { count: 'exact', head: true })
    .eq('quote_id', quote.id).eq('doctor_id', doctor.id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: 'Ce devis a déjà reçu des versements : passez-le en « annulé » plutôt que de le supprimer.',
    }, { status: 409 })
  }

  const { error } = await supabase
    .from('quotes').delete().eq('id', quote.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
