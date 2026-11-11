// API stock — ce qu'une consultation a consommé.
//
// GET  /api/stock/consommation?motif=<clé>   les articles du cabinet, et ce
//                                            que ce motif consomme d'habitude
// POST /api/stock/consommation               déduire, et retenir l'habitude
//
// ── CE QUE ÇA RÉSOUT ────────────────────────────────────────────────────────
//
// Le stock ne descendait que si quelqu'un ouvrait l'écran Stock pour saisir
// une sortie. Au fauteuil, personne ne le fait, et un stock qui n'est pas tenu
// ment : il annonce douze carpules le jour où il n'en reste plus.
//
// La clôture de la consultation pose désormais la question — « Qu'avez-vous
// utilisé ? » — avec la réponse déjà écrite : ce que le cabinet a déduit la
// dernière fois pour le même motif (migration v99).
//
// ── LES SORTIES PASSENT PAR LE MÊME CHEMIN QUE TOUTES LES AUTRES ────────────
//
// `stock_mouvement()` (v88), une fois par article : la ligne de journal et la
// nouvelle quantité dans la même transaction, sous verrou de ligne. Cette
// route n'écrit JAMAIS stock_articles.quantite elle-même — deux chemins vers
// le même nombre, ce sont deux comptes qui divergent.
//
// Le journal porte « Consultation — Détartrage », jamais le nom du patient :
// le stock n'est pas une donnée de santé, et il ne doit pas le devenir en
// reliant une personne à ce qu'on a ouvert pour elle.
import { NextRequest, NextResponse } from 'next/server'
import { requireStockDoctor, tableStockAbsente, STOCK_NON_ACTIVE } from '@/lib/stock-server'
import { tableAbsente, colonneAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

/** Au-delà, ce n'est plus une consultation, c'est un inventaire. */
const MAX_LIGNES = 40
const SANS_MOTIF = 'sans-motif'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** La clé d'un motif : son identifiant, ou « sans-motif ». Tout le reste est
 *  refusé — la clé part dans une requête, on ne la prend pas telle quelle. */
function cleMotif(brut: unknown): string {
  const v = String(brut ?? '').trim()
  return UUID.test(v) ? v.toLowerCase() : SANS_MOTIF
}

export async function GET(req: NextRequest) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data: articles, error } = await supabase
    .from('stock_articles')
    .select('id, nom, categorie, unite, quantite')
    .eq('doctor_id', doctor.id).eq('actif', true)
    .order('categorie', { ascending: true, nullsFirst: false })
    .order('nom', { ascending: true })

  if (error) {
    // Sans la v88, il n'y a pas de stock : la clôture se passe de la question.
    if (tableStockAbsente(error)) return NextResponse.json({ articles: [], habituels: [], indisponible: true })
    console.error('[Stock] articles illisibles à la clôture :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }

  // La mémoire, lue À PART : sans la v99 la question se pose quand même, avec
  // une liste vide, et l'écran dit que le pré-remplissage attend.
  const motif = cleMotif(req.nextUrl.searchParams.get('motif'))
  const { data: habituels, error: eMemoire } = await supabase
    .from('motif_consommables')
    .select('article_id, quantite')
    .eq('doctor_id', doctor.id).eq('motif_cle', motif)

  const memoire = !eMemoire
  if (eMemoire && !tableAbsente(eMemoire.code) && !colonneAbsente(eMemoire.code)) {
    console.error('[Stock] habitudes illisibles :', eMemoire.message)
  }

  // Une habitude dont l'article a été archivé ne revient pas : on ne propose
  // pas de déduire ce qu'on ne tient plus.
  const vivants = new Set((articles ?? []).map((a) => a.id))
  return NextResponse.json({
    articles: articles ?? [],
    habituels: (habituels ?? []).filter((h) => vivants.has(h.article_id)),
    memoire,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireStockDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const motif = cleMotif(body.motif_cle)
  const nomMotif = String(body.motif_nom ?? '').trim().slice(0, 120)

  // Les lignes, nettoyées. Deux fois le même article = une seule sortie de la
  // somme : deux mouvements pour une même boîte rendraient le journal illisible.
  const voulu = new Map<string, number>()
  for (const l of Array.isArray(body.lignes) ? body.lignes.slice(0, MAX_LIGNES) : []) {
    const id = String(l?.article_id ?? '').trim().toLowerCase()
    const qte = Number(l?.quantite)
    if (!UUID.test(id) || !Number.isFinite(qte) || qte <= 0) continue
    voulu.set(id, Math.round(((voulu.get(id) ?? 0) + qte) * 100) / 100)
  }
  if (voulu.size === 0) {
    return NextResponse.json({ error: 'Aucun article à déduire.' }, { status: 400 })
  }

  // Les articles appartiennent-ils au cabinet ? La RLS le dirait, mais par
  // une exception SQL au milieu de la série ; on veut le savoir AVANT de
  // commencer à déduire.
  const { data: connus, error: eLecture } = await supabase
    .from('stock_articles').select('id, nom')
    .eq('doctor_id', doctor.id).in('id', Array.from(voulu.keys()))
  if (eLecture) {
    if (tableStockAbsente(eLecture)) return NextResponse.json({ error: STOCK_NON_ACTIVE }, { status: 503 })
    console.error('[Stock] articles illisibles avant déduction :', eLecture.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  const noms = new Map((connus ?? []).map((a) => [a.id, a.nom as string]))
  const lignes = Array.from(voulu.entries()).filter(([id]) => noms.has(id))
  if (lignes.length === 0) {
    return NextResponse.json({ error: 'Articles introuvables.' }, { status: 404 })
  }

  // ── Les sorties, une par article ─────────────────────────────────────────
  // L'une après l'autre : chacune est sa propre transaction. Si la troisième
  // échoue, les deux premières sont faites et le restent — on le DIT, article
  // par article, pour que l'écran ne propose de recommencer que ce qui manque.
  const libelle = nomMotif ? `Consultation — ${nomMotif}` : 'Consultation'
  const faits: { article_id: string; quantite: number }[] = []
  const echecs: string[] = []
  const avertissements: string[] = []

  for (const [id, qte] of lignes) {
    const { data, error } = await supabase.rpc('stock_mouvement', {
      p_article: id, p_sens: 'sortie', p_qte: qte, p_motif: libelle,
    })
    if (error) {
      if (tableStockAbsente(error)) return NextResponse.json({ error: STOCK_NON_ACTIVE }, { status: 503 })
      console.error('[Stock] sortie de consultation refusée :', error.message)
      echecs.push(id)
      continue
    }
    const article = Array.isArray(data) ? data[0] : data
    const apres = Number(article?.quantite ?? NaN)
    faits.push({ article_id: id, quantite: apres })
    // Une sortie plus grande que le stock n'est jamais refusée (v88) : le
    // compte passe sous zéro, et c'est l'alerte elle-même.
    if (Number.isFinite(apres) && apres < 0) {
      avertissements.push(`Le compte de « ${noms.get(id)} » est passé sous zéro : corrigez-le par un inventaire.`)
    }
  }

  // ── L'habitude ───────────────────────────────────────────────────────────
  // Ce que le praticien vient de valider REMPLACE ce qu'on retenait pour ce
  // motif : la dernière fois fait foi. On retient ce qu'il a DIT avoir
  // utilisé, y compris une ligne dont la sortie a échoué — l'échec est une
  // panne, pas un changement d'habitude.
  let memoire = true
  const { error: eOubli } = await supabase
    .from('motif_consommables').delete()
    .eq('doctor_id', doctor.id).eq('motif_cle', motif)
  if (eOubli) {
    memoire = false
    if (!tableAbsente(eOubli.code)) console.error('[Stock] habitude non remplacée :', eOubli.message)
  } else {
    const { error: eRetenir } = await supabase.from('motif_consommables').insert(
      lignes.map(([id, qte]) => ({
        doctor_id: doctor.id, motif_cle: motif, article_id: id, quantite: qte,
      })),
    )
    if (eRetenir) {
      memoire = false
      console.error('[Stock] habitude non retenue :', eRetenir.message)
    }
  }

  return NextResponse.json({ faits, echecs, avertissements, memoire })
}
