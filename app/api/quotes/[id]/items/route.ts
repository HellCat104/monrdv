// API devis — ajout d'une ligne (un acte, éventuellement sur une dent).
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, loadOwnedQuote, quoteNotFound } from '@/lib/devis-server'
import { isValidTooth } from '@/lib/dental'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  const body = await req.json().catch(() => ({}))
  const label = String(body.label ?? '').trim().slice(0, 160)
  if (!label) return NextResponse.json({ error: 'Libellé de l\'acte manquant' }, { status: 400 })

  const price = Number(body.unit_price ?? 0)
  if (!Number.isFinite(price) || price < 0 || price > 1000000) {
    return NextResponse.json({ error: 'Prix invalide' }, { status: 400 })
  }
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
  }

  // La dent est facultative : un détartrage ne vise aucune dent précise.
  let tooth: string | null = null
  if (body.tooth !== undefined && body.tooth !== null && String(body.tooth).trim() !== '') {
    tooth = String(body.tooth).trim()
    if (!isValidTooth(tooth)) {
      return NextResponse.json({ error: 'Numéro de dent invalide (notation FDI, ex. 16)' }, { status: 400 })
    }
  }

  // Position : à la suite des lignes existantes, pour que l'ordre de saisie
  // soit l'ordre d'affichage sans que le client ait à le calculer.
  const { data: last } = await supabase
    .from('quote_items').select('position')
    .eq('quote_id', quote.id).order('position', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase
    .from('quote_items')
    .insert({
      quote_id: quote.id,
      doctor_id: doctor.id,   // recalé sur le devis parent par le trigger v54
      tooth,
      label,
      unit_price: price,
      quantity,
      position: ((last?.position as number | null) ?? 0) + 1,
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[Devis] ligne impossible :', error?.message)
    return NextResponse.json({ error: 'La ligne n\'a pas pu être ajoutée' }, { status: 500 })
  }

  // Une ligne ajoutée modifie le devis : on garde updated_at parlant.
  await supabase.from('quotes').update({ updated_at: new Date().toISOString() })
    .eq('id', quote.id).eq('doctor_id', doctor.id)

  return NextResponse.json(data, { status: 201 })
}
