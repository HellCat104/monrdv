// API stock — le JOURNAL d'un article, et le seul chemin vers sa quantité.
//
// ── POURQUOI UNE FONCTION SQL ───────────────────────────────────────────────
//
// Un mouvement, ce sont deux écritures : la ligne de journal et la nouvelle
// quantité. Faites depuis ici, l'une peut réussir et l'autre échouer, et le
// compte ne correspond plus à son histoire. `stock_mouvement()` (v88) les fait
// dans la même transaction, sous verrou de ligne — sans quoi le médecin au
// fauteuil et la secrétaire au comptoir lisent le même « 12 » et écrivent
// tous les deux « 11 ».
//
// Elle est SECURITY INVOKER : la RLS s'applique comme pour n'importe quelle
// requête, et un article d'un autre cabinet reste invisible.
import { NextRequest, NextResponse } from 'next/server'
import { requireStockDoctor, tableStockAbsente, STOCK_NON_ACTIVE } from '@/lib/stock-server'

export const dynamic = 'force-dynamic'

const SENS = ['entree', 'sortie', 'inventaire']

// GET — le journal de l'article, du plus récent au plus ancien.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data, error } = await supabase
    .from('stock_mouvements')
    .select('id, article_id, sens, quantite, quantite_apres, motif, created_at')
    .eq('article_id', params.id).eq('doctor_id', doctor.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    if (tableStockAbsente(error)) return NextResponse.json({ mouvements: [], indisponible: true })
    console.error('[Stock] journal illisible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ mouvements: data ?? [] })
}

// POST — { sens, quantite, motif }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const sens = String(body.sens ?? '')
  if (!SENS.includes(sens)) return NextResponse.json({ error: 'Sens de mouvement inconnu.' }, { status: 400 })

  const qte = Number(body.quantite)
  if (!Number.isFinite(qte) || qte <= 0) {
    return NextResponse.json({ error: 'La quantité doit être supérieure à zéro.' }, { status: 400 })
  }

  // L'article doit appartenir au cabinet. La RLS le dirait aussi, mais la
  // fonction répondrait par une exception SQL là où on veut un 404 clair.
  const { data: article, error: eLecture } = await supabase
    .from('stock_articles').select('id, nom, quantite, unite')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()

  if (eLecture && tableStockAbsente(eLecture)) {
    return NextResponse.json({ error: STOCK_NON_ACTIVE }, { status: 503 })
  }
  if (!article) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })

  const { data, error } = await supabase.rpc('stock_mouvement', {
    p_article: params.id,
    p_sens: sens,
    p_qte: qte,
    p_motif: body.motif ? String(body.motif).slice(0, 300) : null,
  })

  if (error) {
    if (tableStockAbsente(error)) return NextResponse.json({ error: STOCK_NON_ACTIVE }, { status: 503 })
    console.error('[Stock] mouvement refusé :', error.message)
    return NextResponse.json({ error: 'Le mouvement n’a pas pu être enregistré' }, { status: 500 })
  }

  // La fonction renvoie l'article à jour. On le relit au besoin : l'écran doit
  // afficher le nombre qui est EN BASE, pas celui qu'il avait calculé.
  const article2 = Array.isArray(data) ? data[0] : data
  if (!article2) {
    const { data: relu } = await supabase
      .from('stock_articles').select('id, nom, quantite, unite, seuil_alerte, peremption')
      .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
    return NextResponse.json({ article: relu })
  }

  // Une sortie plus grande que le stock n'est jamais refusée — refuser au
  // fauteuil ferait abandonner le module. Le compte descend sous zéro, ce qui
  // est l'alerte elle-même : il ne peut venir que d'un comptage inexact.
  const avertissement = Number(article2.quantite) < 0
    ? `Le compte de « ${article2.nom} » est passé sous zéro : corrigez-le par un inventaire.`
    : null

  return NextResponse.json({ article: article2, avertissement })
}
