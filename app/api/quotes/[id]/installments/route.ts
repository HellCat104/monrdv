// API devis — échéancier prévisionnel.
//
// ATTENTION : rien ici n'est de l'argent. Une échéance dit « le patient devrait
// verser 500 DH le 15 mars » ; elle ne crée aucune recette, n'apparaît ni dans
// la caisse, ni dans les factures, ni dans le chiffre d'affaires. Ce qui a été
// reçu vit dans quote_payments, et nulle part ailleurs. C'est pour cette
// raison qu'une échéance ne porte aucune marque « payée » : le jour où elle en
// porterait une, quelqu'un finirait par sommer l'échéancier au lieu des
// versements et le CA compterait de l'argent jamais encaissé.
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, loadOwnedQuote, quoteNotFound } from '@/lib/devis-server'
import { buildInstallments, quoteRemaining } from '@/lib/devis'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * POST — deux usages :
 *   { count, first_date }        → génère `count` mensualités et REMPLACE
 *                                  l'échéancier existant (le montant réparti
 *                                  est le reste dû, pas le total du devis :
 *                                  ce qui est déjà versé n'est plus à prévoir).
 *   { due_date, amount, label? } → ajoute une échéance isolée.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  const body = await req.json().catch(() => ({}))

  // ── Cas 1 : une échéance isolée ────────────────────────────────────────
  if (body.due_date && body.count === undefined) {
    const dueDate = String(body.due_date)
    if (!DATE_RE.test(dueDate)) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('quote_installments')
      .insert({
        quote_id: quote.id,
        doctor_id: doctor.id,   // recalé sur le devis parent par le trigger v54
        due_date: dueDate,
        amount,
        label: body.label ? String(body.label).slice(0, 120) : null,
      })
      .select('*').single()
    if (error || !data) return NextResponse.json({ error: 'Échéance non enregistrée' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── Cas 2 : génération d'un échéancier mensuel ─────────────────────────
  const count = Number(body.count)
  if (!Number.isInteger(count) || count < 1 || count > 60) {
    return NextResponse.json({ error: 'Nombre de mensualités invalide (1 à 60)' }, { status: 400 })
  }
  const firstDate = String(body.first_date ?? '')
  if (!DATE_RE.test(firstDate)) {
    return NextResponse.json({ error: 'Date de première échéance invalide' }, { status: 400 })
  }

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from('quote_items').select('unit_price, quantity').eq('quote_id', quote.id),
    supabase.from('quote_payments').select('amount').eq('quote_id', quote.id),
  ])
  const reste = quoteRemaining(items ?? [], payments ?? [])
  if (reste <= 0) {
    return NextResponse.json({
      error: 'Rien à échelonner : ce devis est vide ou déjà entièrement réglé.',
    }, { status: 400 })
  }

  const lignes = buildInstallments(reste, count, firstDate)
  if (lignes.length === 0) {
    return NextResponse.json({ error: 'Échéancier impossible à calculer' }, { status: 400 })
  }

  // Remplacement et non ajout : régénérer devait donner un échéancier propre,
  // pas empiler deux plannings contradictoires sous les yeux du patient.
  await supabase.from('quote_installments')
    .delete().eq('quote_id', quote.id).eq('doctor_id', doctor.id)

  const { data, error } = await supabase
    .from('quote_installments')
    .insert(lignes.map((l) => ({
      quote_id: quote.id,
      doctor_id: doctor.id,
      due_date: l.due_date,
      amount: l.amount,
    })))
    .select('*')

  if (error) {
    console.error('[Devis] échéancier impossible :', error.message)
    return NextResponse.json({ error: 'L\'échéancier n\'a pas pu être créé' }, { status: 500 })
  }
  return NextResponse.json({ installments: data ?? [] }, { status: 201 })
}

// DELETE ?installment_id=… — retire une échéance ; sans paramètre, efface tout
// l'échéancier. Aucun verrou comptable : un prévisionnel n'engage rien.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  const id = req.nextUrl.searchParams.get('installment_id')
  let q = supabase.from('quote_installments').delete()
    .eq('quote_id', quote.id).eq('doctor_id', doctor.id)
  if (id) q = q.eq('id', id)

  const { error } = await q
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
