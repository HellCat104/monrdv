// API stock — la liste du cabinet, et la création d'un article.
//
// Médecin uniquement (voir lib/stock-server.ts). La quantité n'est PAS
// modifiable ici : elle ne change que par un mouvement, sur
// /api/stock/[id]/mouvement. Deux chemins vers le même nombre, c'est deux
// comptes qui divergent.
import { NextRequest, NextResponse } from 'next/server'
import { requireStockDoctor, tableStockAbsente, STOCK_NON_ACTIVE } from '@/lib/stock-server'

export const dynamic = 'force-dynamic'

const CHAMPS = 'id, nom, categorie, reference, fournisseur, unite, quantite, seuil_alerte, peremption, prix_achat, notes, actif, updated_at'

// GET /api/stock — les articles du cabinet. `?archives=1` ajoute ceux qu'on
// ne tient plus (leur journal reste lisible).
export async function GET(req: NextRequest) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  let q = supabase.from('stock_articles').select(CHAMPS).eq('doctor_id', doctor.id)
  if (req.nextUrl.searchParams.get('archives') !== '1') q = q.eq('actif', true)

  const { data, error } = await q
    .order('categorie', { ascending: true, nullsFirst: false })
    .order('nom', { ascending: true })

  if (error) {
    // Tant que la v88 n'est pas passée, l'écran s'annonce en attente au lieu
    // de tomber en erreur.
    if (tableStockAbsente(error)) {
      return NextResponse.json({ articles: [], indisponible: true, message: STOCK_NON_ACTIVE })
    }
    console.error('[Stock] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ articles: data ?? [] })
}

// POST /api/stock — nouvel article. La quantité de départ est acceptée ici
// parce qu'il faut bien partir de quelque part ; elle est écrite comme un
// INVENTAIRE dans le journal, pas comme une valeur tombée du ciel.
export async function POST(req: NextRequest) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const nom = String(body.nom ?? '').trim()
  if (!nom) return NextResponse.json({ error: 'Donnez un nom à l’article.' }, { status: 400 })
  if (nom.length > 120) return NextResponse.json({ error: 'Nom trop long (120 caractères).' }, { status: 400 })

  const nombre = (v: unknown): number | null => {
    if (v === undefined || v === null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const depart = nombre(body.quantite) ?? 0
  // Une quantité de départ négative n'a pas de sens, et elle se contredisait
  // avec le premier mouvement écrit plus bas (un inventaire porte une
  // magnitude positive) : l'article serait né avec un compte et le journal
  // avec un autre. On refuse au lieu de deviner.
  if (depart < 0) {
    return NextResponse.json(
      { error: 'La quantité de départ ne peut pas être négative.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('stock_articles')
    .insert({
      doctor_id: doctor.id,
      nom,
      categorie:   body.categorie   ? String(body.categorie).slice(0, 80) : null,
      reference:   body.reference   ? String(body.reference).slice(0, 80) : null,
      fournisseur: body.fournisseur ? String(body.fournisseur).slice(0, 120) : null,
      unite:       body.unite ? String(body.unite).slice(0, 30) : 'unité',
      quantite:    depart,
      seuil_alerte: nombre(body.seuil_alerte),
      peremption:  /^\d{4}-\d{2}-\d{2}$/.test(String(body.peremption ?? '')) ? String(body.peremption) : null,
      prix_achat:  nombre(body.prix_achat),
      notes:       body.notes ? String(body.notes).slice(0, 1000) : null,
    })
    .select(CHAMPS)
    .single()

  if (error || !data) {
    if (tableStockAbsente(error)) {
      return NextResponse.json({ error: STOCK_NON_ACTIVE }, { status: 503 })
    }
    // 23505 : l'index unique sur (cabinet, nom). Deux « Gants M » dans un
    // cabinet, ce sont deux comptes qui se contredisent.
    if (error?.code === '23505') {
      return NextResponse.json({ error: `« ${nom} » existe déjà dans votre stock.` }, { status: 409 })
    }
    console.error('[Stock] création impossible :', error?.message)
    return NextResponse.json({ error: 'L’article n’a pas pu être créé' }, { status: 500 })
  }

  // La quantité de départ entre dans le journal, pour que la première ligne
  // ne soit pas un chiffre sans origine. Un échec ici n'annule pas l'article :
  // il vaut mieux un article sans première ligne qu'une création perdue.
  if (depart !== 0) {
    const { error: eMvt } = await supabase.rpc('stock_mouvement', {
      p_article: data.id, p_sens: 'inventaire', p_qte: depart,
      p_motif: 'Quantité à la création',
    })
    if (eMvt) console.error('[Stock] premier mouvement non écrit :', eMvt.message)
  }

  return NextResponse.json({ article: data })
}
