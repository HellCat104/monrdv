// API devis — avoir sur un versement déjà facturé.
//
// Même principe qu'un avoir de rendez-vous (app/api/appointments/[id]/credit-note) :
// on n'annule jamais une facture et on ne supprime jamais son numéro — cela
// ouvrirait un trou dans la séquence, ce qu'un contrôle fiscal relève. On émet
// un avoir numéroté AV-AAAA-NNNN qui la référence.
//
// On réutilise volontairement la table `credit_notes` (v17) plutôt que d'en
// créer une seconde : les écrans qui totalisent déjà les avoirs du médecin
// (statistiques, liste des factures) prennent donc ceux-ci en compte sans une
// ligne de code supplémentaire.
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, loadOwnedQuote, quoteNotFound } from '@/lib/devis-server'
import { canAccess } from '@/lib/plan'
import { round2 } from '@/lib/devis'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; paymentId: string } },
) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  if (!canAccess(doctor.plan, 'invoicing')) {
    return NextResponse.json({ error: 'La facturation nécessite le forfait Cabinet complet' }, { status: 403 })
  }

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  const { data: payment } = await supabase
    .from('quote_payments')
    .select('id, amount, invoice_no, patient:patients(first_name, last_name)')
    .eq('id', params.paymentId).eq('quote_id', quote.id).eq('doctor_id', doctor.id)
    .maybeSingle()
  if (!payment) return NextResponse.json({ error: 'Versement introuvable' }, { status: 404 })
  if (!payment.invoice_no) {
    return NextResponse.json({
      error: 'Ce versement n\'est pas facturé : supprimez-le plutôt que d\'émettre un avoir.',
    }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const reason: string | null = body.reason ? String(body.reason).slice(0, 500) : null

  // Avoirs déjà émis sur cette facture : on ne rend jamais plus que reçu.
  const { data: existing } = await supabase
    .from('credit_notes').select('amount').eq('quote_payment_id', payment.id)
  const deja = (existing ?? []).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  const restant = round2(Number(payment.amount) - deja)
  if (restant <= 0) {
    return NextResponse.json({ error: 'Ce versement est déjà entièrement avoiré.' }, { status: 400 })
  }

  const demande = body.amount === undefined || body.amount === null ? restant : Number(body.amount)
  if (!Number.isFinite(demande) || demande <= 0) {
    return NextResponse.json({ error: 'Montant d\'avoir invalide.' }, { status: 400 })
  }
  if (demande > restant) {
    return NextResponse.json({ error: `Le montant de l'avoir ne peut pas dépasser ${restant} DH.` }, { status: 400 })
  }

  const pat = payment.patient as unknown as { first_name?: string; last_name?: string } | null
  const patientName = pat ? `${pat.first_name ?? ''} ${pat.last_name ?? ''}`.trim() : null

  const { data: credit, error } = await supabase
    .from('credit_notes')
    .insert({
      doctor_id: doctor.id,
      quote_payment_id: payment.id,
      original_invoice_no: payment.invoice_no,
      patient_name: patientName,
      amount: demande,
      reason,
    })
    .select('*')
    .single()

  if (error || !credit) {
    console.error('[Devis] avoir impossible :', error?.message)
    return NextResponse.json({ error: 'Erreur lors de l\'émission de l\'avoir' }, { status: 500 })
  }

  return NextResponse.json(credit, { status: 201 })
}
