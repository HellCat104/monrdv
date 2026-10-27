// API stock — modifier la fiche d'un article, ou l'archiver.
//
// La QUANTITÉ ne passe pas par ici, volontairement : elle ne change que par un
// mouvement (/api/stock/[id]/mouvement), qui l'écrit et la journalise dans la
// même transaction. Un PATCH qui accepterait `quantite` rouvrirait un second
// chemin vers le même nombre, sans trace de la raison.
import { NextRequest, NextResponse } from 'next/server'
import { requireStockDoctor, tableStockAbsente, STOCK_NON_ACTIVE } from '@/lib/stock-server'

export const dynamic = 'force-dynamic'

const CHAMPS = 'id, nom, categorie, reference, fournisseur, unite, quantite, seuil_alerte, peremption, prix_achat, notes, actif, updated_at'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  const nombre = (v: unknown): number | null => {
    if (v === null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  if (body.nom !== undefined) {
    const nom = String(body.nom).trim()
    if (!nom) return NextResponse.json({ error: 'Donnez un nom à l’article.' }, { status: 400 })
    updates.nom = nom.slice(0, 120)
  }
  if (body.categorie   !== undefined) updates.categorie   = body.categorie   ? String(body.categorie).slice(0, 80) : null
  if (body.reference   !== undefined) updates.reference   = body.reference   ? String(body.reference).slice(0, 80) : null
  if (body.fournisseur !== undefined) updates.fournisseur = body.fournisseur ? String(body.fournisseur).slice(0, 120) : null
  if (body.unite       !== undefined) updates.unite       = body.unite ? String(body.unite).slice(0, 30) : 'unité'
  if (body.seuil_alerte !== undefined) updates.seuil_alerte = nombre(body.seuil_alerte)
  if (body.prix_achat   !== undefined) updates.prix_achat   = nombre(body.prix_achat)
  if (body.notes        !== undefined) updates.notes        = body.notes ? String(body.notes).slice(0, 1000) : null
  if (body.peremption   !== undefined) {
    updates.peremption = /^\d{4}-\d{2}-\d{2}$/.test(String(body.peremption ?? '')) ? String(body.peremption) : null
  }
  if (body.actif !== undefined) updates.actif = Boolean(body.actif)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('stock_articles').update(updates)
    .eq('id', params.id).eq('doctor_id', doctor.id)
    .select(CHAMPS).maybeSingle()

  if (error) {
    if (tableStockAbsente(error)) return NextResponse.json({ error: STOCK_NON_ACTIVE }, { status: 503 })
    if (error.code === '23505') return NextResponse.json({ error: 'Un article porte déjà ce nom.' }, { status: 409 })
    console.error('[Stock] modification impossible :', error.message)
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  // Un article d'un autre cabinet répond « introuvable » et non « interdit » :
  // un 403 confirmerait que l'identifiant essayé existe quelque part.
  if (!data) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  return NextResponse.json({ article: data })
}

// DELETE — on ARCHIVE. Un article consommé pendant deux ans a une histoire, et
// la supprimer emporterait son journal (cascade) : le cabinet perdrait la
// trace de ce qu'il a acheté. L'article sort des listes, le journal reste.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data, error } = await supabase
    .from('stock_articles').update({ actif: false })
    .eq('id', params.id).eq('doctor_id', doctor.id)
    .select('id').maybeSingle()

  if (error) {
    if (tableStockAbsente(error)) return NextResponse.json({ error: STOCK_NON_ACTIVE }, { status: 503 })
    console.error('[Stock] archivage impossible :', error.message)
    return NextResponse.json({ error: 'Archivage impossible' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
