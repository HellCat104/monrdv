// Catalogue des actes de feuille de soins — GET /api/feuilles-soins/actes
//
// Même principe que le catalogue des devis : le logiciel n'invente aucun code
// de nomenclature. Il rend au praticien ce qu'il a déjà écrit — libellé, code
// et dernier montant — pour qu'il ne le retape pas à chaque feuille.
import { NextResponse } from 'next/server'
import { requireFeuilleDoctor } from '@/lib/feuilles-soins-server'
import { tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

const MAX_ACTES = 40
/** Au-delà, la rangée de raccourcis passerait à la ligne et cesserait d'en
 *  être une. */
const MAX_RECENTS = 8
/** La mémoire des tarifs remonte sur ces lignes-là. Un cabinet qui cote vingt
 *  actes par jour couvre ainsi plusieurs mois ; au-delà, un acte qu'on n'a pas
 *  pratiqué depuis tout ce temps est précisément celui dont le tarif a changé.
 *  Les tarifs qu'on veut garder pour de bon se posent dans les Paramètres, sur
 *  le motif qui porte le code — et ils sont relus ici. */
const MAX_LIGNES = 2000

export async function GET() {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data, error } = await supabase
    .from('care_sheet_items')
    .select('label, code, amount, created_at')
    .eq('doctor_id', doctor.id)
    .order('created_at', { ascending: false })
    .limit(MAX_LIGNES)

  if (error) {
    if (!tableAbsente(error.code)) console.error('[Feuille de soins] catalogue illisible :', error.message)
    return NextResponse.json({ actes: [] })
  }

  const parCle = new Map<string, { label: string; code: string | null; amount: number; n: number }>()
  for (const ligne of data ?? []) {
    const label = String(ligne.label ?? '').trim()
    if (!label) continue
    const cle = label.toLowerCase().replace(/\s+/g, ' ')
    const vu = parCle.get(cle)
    if (vu) vu.n += 1
    // Les lignes arrivent de la plus récente à la plus ancienne : la première
    // vue porte le code et le tarif à proposer.
    else parCle.set(cle, { label, code: ligne.code ?? null, amount: Number(ligne.amount ?? 0), n: 1 })
  }

  // Deux lectures du même relevé, pour deux usages distincts.
  //
  // `actes` sert à compléter une saisie libre : l'ordre le plus utile y est
  // celui de la FRÉQUENCE, pour que le geste courant arrive en tête.
  //
  // `recents` sert aux raccourcis « récemment utilisés » devant la feuille :
  // l'ordre utile y est celui du TEMPS. Un praticien qui vient de poser trois
  // couronnes les repose dans la journée ; ce qu'il a fait le mois dernier ne
  // l'intéresse pas. Les lignes arrivent déjà de la plus récente à la plus
  // ancienne, et la Map conserve cet ordre d'insertion : on le prend tel quel.
  const vus = Array.from(parCle.values())

  // ── LES TARIFS, PAR CODE ───────────────────────────────────────────────
  //
  // Un prix tapé une fois doit revenir tout seul la fois suivante. Il
  // revenait déjà, mais SEULEMENT pour les huit derniers actes posés : la
  // liste `recents` sert la rangée de raccourcis, et elle est courte pour que
  // cette rangée tienne sur une ligne. Un acte pratiqué le mois dernier en
  // sortait, et le praticien retapait son tarif.
  //
  // `tarifs` est une table à part, sans plafond d'affichage : tout code vu
  // dans le relevé y porte le DERNIER montant facturé (les lignes arrivent de
  // la plus récente à la plus ancienne, la première gagne).
  //
  // Un montant nul n'est pas un tarif : c'est un acte enregistré sans prix,
  // et le proposer ferait réécrire un zéro à chaque feuille.
  const tarifs: Record<string, number> = {}
  for (const ligne of data ?? []) {
    const code = String(ligne.code ?? '').trim().toUpperCase()
    const montant = Number(ligne.amount ?? 0)
    if (!code || !(montant > 0) || tarifs[code] !== undefined) continue
    tarifs[code] = montant
  }

  // Le tarif POSÉ À LA MAIN dans les Paramètres l'emporte-t-il ? Non : il
  // complète. Ce que le praticien a facturé en dernier est plus vrai que ce
  // qu'il a noté un jour dans ses réglages ; mais pour un acte qu'il n'a pas
  // encore coté, son catalogue est la seule source, et c'est là qu'un cabinet
  // qui s'installe entre sa grille d'honoraires.
  const { data: catalogue } = await supabase
    .from('consultation_types')
    .select('code, default_price')
    .eq('doctor_id', doctor.id)
    .eq('active', true)
    .not('code', 'is', null)
    .not('default_price', 'is', null)
  for (const ligne of catalogue ?? []) {
    const code = String(ligne.code ?? '').trim().toUpperCase()
    const montant = Number(ligne.default_price ?? 0)
    if (!code || !(montant > 0) || tarifs[code] !== undefined) continue
    tarifs[code] = montant
  }

  return NextResponse.json({
    actes: vus.slice().sort((a, b) => b.n - a.n).slice(0, MAX_ACTES),
    recents: vus.filter((a) => !!a.code).slice(0, MAX_RECENTS),
    tarifs,
  })
}
