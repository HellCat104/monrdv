// API devis — détail, modification (libellé, notes, validité, statut) et suppression.
// Médecin propriétaire uniquement (voir app/api/quotes/route.ts).
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, loadOwnedQuote, quoteNotFound, colonneValiditeAbsente, VALIDITE_NON_ACTIVEE } from '@/lib/devis-server'
import { normaliserValidite } from '@/lib/devis'
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

// PATCH — libellé, notes, validité (v58), statut.
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

  // Validité (v58) : texte libre du médecin, modifiable après la création.
  // Chaîne vide → NULL → plus aucune ligne de validité sur le devis. Trop
  // longue → refusée, jamais tronquée (voir POST /api/quotes).
  if (body.validity_text !== undefined) {
    const validite = normaliserValidite(body.validity_text)
    if (!validite.ok) return NextResponse.json({ error: validite.error }, { status: 400 })
    updates.validity_text = validite.value
  }

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
    //
    // Le commentaire l'annonçait, le code ne le faisait pas : chaque passage
    // réécrivait la date. Ce n'était qu'une imprécision tant que la date ne
    // servait qu'à l'écran ; c'est devenu un défaut depuis que `proposed_at`
    // est la DATE D'ÉMISSION imprimée sur le devis. Le patient qui a reçu un
    // devis daté du 3 mars, « valable 3 mois », verrait sa date glisser au
    // jour où le praticien a changé le statut — et la validité avec elle.
    if (status === 'propose' && !quote.proposed_at) updates.proposed_at = new Date().toISOString()
    if (status === 'accepte' && !quote.accepted_at) updates.accepted_at = new Date().toISOString()
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('quotes').update(updates)
    .eq('id', quote.id).eq('doctor_id', doctor.id)
    .select('*, items:quote_items(*), payments:quote_payments(*), installments:quote_installments(*)')
    .single()

  if (error || !data) {
    if ('validity_text' in updates && colonneValiditeAbsente(error)) {
      return NextResponse.json({ error: VALIDITE_NON_ACTIVEE }, { status: 503 })
    }
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  // Écriture relue : « enregistré » ne s'affiche que si la base contient bien
  // la mention envoyée — c'est elle qui sera imprimée sur le devis.
  if ('validity_text' in updates && (data.validity_text ?? null) !== updates.validity_text) {
    console.error('[Devis] validité non enregistrée pour le devis', quote.id)
    return NextResponse.json({ error: 'La mention de validité n\'a pas été enregistrée. Réessayez.' }, { status: 500 })
  }
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
