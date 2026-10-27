// Un mouvement de stock saisi au comptoir.
//
// Le seul verbe accordé au secrétariat sur le stock. Il passe par la même
// fonction SQL que le médecin : la ligne de journal et la nouvelle quantité
// s'écrivent dans la même transaction, sous verrou de ligne — c'est justement
// le cas où deux personnes comptent en même temps, lui au fauteuil et elle au
// comptoir, que ce verrou existe pour tenir.
import { NextRequest, NextResponse } from 'next/server'
import { getStaffContext } from '@/lib/cabinet'
import { createAdminClient } from '@/lib/supabase/server'
import { tableStockAbsente } from '@/lib/stock-server'

export const dynamic = 'force-dynamic'

const SENS = ['entree', 'sortie', 'inventaire']

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.stock) {
    return NextResponse.json({ error: 'Permission manquante (stock)' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const sens = String(body.sens ?? '')
  if (!SENS.includes(sens)) return NextResponse.json({ error: 'Sens de mouvement inconnu.' }, { status: 400 })

  const qte = Number(body.quantite)
  if (!Number.isFinite(qte) || qte <= 0) {
    return NextResponse.json({ error: 'La quantité doit être supérieure à zéro.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // L'article doit appartenir AU CABINET de cette secrétaire. Le client admin
  // court-circuite la RLS : sans ce contrôle, un identifiant deviné donnerait
  // accès au stock d'un autre praticien.
  const { data: article, error: eLecture } = await admin
    .from('stock_articles').select('id, nom')
    .eq('id', params.id).eq('doctor_id', ctx.doctor.id).maybeSingle()

  if (eLecture && tableStockAbsente(eLecture)) {
    return NextResponse.json({ error: 'Le stock n’est pas encore activé.' }, { status: 503 })
  }
  if (!article) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })

  const { data, error } = await admin.rpc('stock_mouvement', {
    p_article: params.id,
    p_sens: sens,
    p_qte: qte,
    // Le journal dit QUI a compté. Sans cela, le praticien qui relit une
    // sortie de douze boîtes ne sait pas à qui demander ce qui s'est passé.
    p_motif: `${body.motif ? String(body.motif).slice(0, 240) + ' · ' : ''}saisi par ${ctx.staff.name}`,
  })

  if (error) {
    if (tableStockAbsente(error)) {
      return NextResponse.json({ error: 'Le stock n’est pas encore activé.' }, { status: 503 })
    }
    console.error('[cabinet/stock] mouvement refusé :', error.message)
    return NextResponse.json({ error: 'Le mouvement n’a pas pu être enregistré' }, { status: 500 })
  }

  const a = Array.isArray(data) ? data[0] : data
  // On ne renvoie que ce que le comptoir a le droit de voir : pas de prix.
  const vu = a ? { id: a.id, nom: a.nom, unite: a.unite, quantite: a.quantite, seuil_alerte: a.seuil_alerte } : null
  const avertissement = a && Number(a.quantite) < 0
    ? `Le compte de « ${a.nom} » est passé sous zéro : prévenez le médecin, il faudra un inventaire.`
    : null

  return NextResponse.json({ article: vu, avertissement })
}
