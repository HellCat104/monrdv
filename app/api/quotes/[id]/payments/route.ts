// API devis — saisie d'un versement réellement encaissé.
//
// C'EST LA SEULE ROUTE DE CE LOT QUI CRÉE DU CHIFFRE D'AFFAIRES. Tout le reste
// (lignes, statut, échéancier) décrit des intentions ; ici on enregistre de
// l'argent reçu, à sa date de règlement — comptabilité de caisse.
//
// Le numéro F-AAAA-NNNN n'est PAS attribué ici : le trigger
// assign_quote_payment_invoice_no() (migration v54) le pose en base, dans la
// même transaction que l'insertion, en puisant dans le compteur
// `invoice_counters` — le MÊME que celui des factures de rendez-vous. Le faire
// côté application rouvrirait la porte aux doublons que le trigger v13 avait
// justement fermée.
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, loadOwnedQuote, quoteNotFound, enregistrerVersement } from '@/lib/devis-server'
import { canAccess } from '@/lib/plan'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  // Encaisser exige en plus le droit « paiements » du forfait. Il est ouvert
  // aux deux forfaits (v47) : c'est la FACTURE qui est réservée au Cabinet
  // complet, pas l'encaissement.
  if (!canAccess(doctor.plan, 'payments')) {
    return NextResponse.json({ error: 'Votre forfait ne permet pas l\'encaissement' }, { status: 403 })
  }

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  // Montant, mode, date, trop-perçu, insertion et passage en « terminé » : tout
  // est dans lib/devis-server.ts, partagé avec la route secrétaire (v55). Cette
  // route ne garde que ce qui lui est propre — qui est le médecin, et quel devis.
  const body = await req.json().catch(() => ({}))
  const res = await enregistrerVersement(supabase, quote, doctor.id, body)
  if ('error' in res) return res.error

  return NextResponse.json(res.payment, { status: 201 })
}

// DELETE ?payment_id=… — annulation d'un versement saisi par erreur.
// Un versement DÉJÀ FACTURÉ est protégé en base (trigger v54) : sa suppression
// laisserait un trou dans la séquence de factures. La correction passe alors
// par un avoir, comme pour un rendez-vous facturé.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  const paymentId = req.nextUrl.searchParams.get('payment_id')
  if (!paymentId) return NextResponse.json({ error: 'Versement manquant' }, { status: 400 })

  const { data: payment } = await supabase
    .from('quote_payments').select('id, invoice_no')
    .eq('id', paymentId).eq('quote_id', quote.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!payment) return NextResponse.json({ error: 'Versement introuvable' }, { status: 404 })

  if (payment.invoice_no) {
    return NextResponse.json({
      error: `Ce versement est facturé (${payment.invoice_no}) : émettez un avoir au lieu de le supprimer.`,
    }, { status: 409 })
  }

  const { error } = await supabase
    .from('quote_payments').delete()
    .eq('id', paymentId).eq('quote_id', quote.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })

  return NextResponse.json({ success: true })
}
