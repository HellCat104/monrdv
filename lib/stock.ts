// Le STOCK du cabinet — ce qu'on en déduit, en un seul endroit.
//
// L'intérêt d'un stock n'est pas de connaître un chiffre, c'est de savoir
// QUAND IL FAUT COMMANDER. Tout ce module sert à répondre à cette question, et
// les écrans ne font que l'afficher : l'état d'un article est calculé ici, pas
// recopié dans trois composants qui finiraient par ne plus dire la même chose.
//
// Aucun catalogue, aucun fournisseur, aucun tarif n'est livré. Les catégories
// ci-dessous servent à RANGER ; le praticien peut en saisir une autre.

export interface ArticleStock {
  id: string
  nom: string
  categorie?: string | null
  reference?: string | null
  fournisseur?: string | null
  unite: string
  quantite: number
  seuil_alerte?: number | null
  peremption?: string | null
  prix_achat?: number | null
  notes?: string | null
  actif?: boolean
  updated_at?: string | null
}

export type SensMouvement = 'entree' | 'sortie' | 'inventaire'

export interface MouvementStock {
  id: string
  article_id: string
  sens: SensMouvement
  quantite: number
  quantite_apres: number
  motif?: string | null
  created_at: string
}

export const SENS_LABEL: Record<SensMouvement, string> = {
  entree: 'Entrée',
  sortie: 'Sortie',
  inventaire: 'Inventaire',
}

// ── LES UNITÉS ──────────────────────────────────────────────────────────────
//
// On ne compte pas les cartouches d'anesthésique comme les gants. Des
// suggestions, pas une liste fermée : le praticien écrit la sienne.
export const UNITES_STOCK = [
  'unité', 'boîte', 'seringue', 'cartouche', 'flacon', 'tube',
  'paire', 'sachet', 'rouleau', 'blister', 'kit', 'gramme', 'millilitre',
]

// ── LES CATÉGORIES (cabinet dentaire) ───────────────────────────────────────
export const CATEGORIES_STOCK_DENTAIRE = [
  'Anesthésie',
  'Restauration et composites',
  'Endodontie',
  'Empreintes et prothèse',
  'Chirurgie et sutures',
  'Rotatif et instruments',
  'Hygiène et stérilisation',
  'Consommables',
  'Radiologie',
  'Pharmacie et urgence',
  'Administratif',
]

/** Les catégories proposées à cette spécialité. Le module est générique : seuls
 *  les intitulés changent, et un cabinet qui n'est pas dentaire garde une liste
 *  neutre plutôt qu'« Endodontie ». */
export function categoriesStock(dentaire: boolean): string[] {
  return dentaire
    ? CATEGORIES_STOCK_DENTAIRE
    : ['Consommables', 'Hygiène et stérilisation', 'Pharmacie et urgence', 'Administratif']
}

// ── L'ÉTAT D'UN ARTICLE ─────────────────────────────────────────────────────
//
// 'negatif'  : le compte est descendu sous zéro. Ce n'est pas un stock, c'est
//              un comptage faux — une sortie au fauteuil n'est jamais refusée
//              (voir la v88), et le nombre négatif est l'alerte elle-même.
// 'rupture'  : il n'en reste rien.
// 'bas'      : au seuil que LE PRATICIEN a fixé, ou en dessous.
// 'ok'       : rien à signaler.
export type EtatStock = 'negatif' | 'rupture' | 'bas' | 'ok'

export function etatArticle(a: ArticleStock): EtatStock {
  const q = Number(a.quantite ?? 0)
  if (q < 0) return 'negatif'
  if (q === 0) return 'rupture'
  const seuil = a.seuil_alerte == null ? null : Number(a.seuil_alerte)
  if (seuil != null && q <= seuil) return 'bas'
  return 'ok'
}

/** Faut-il commander cet article ? La question que pose le praticien. */
export function aCommander(a: ArticleStock): boolean {
  return etatArticle(a) !== 'ok'
}

export const ETAT_LABEL: Record<EtatStock, string> = {
  negatif: 'Compte à corriger',
  rupture: 'Épuisé',
  bas: 'À commander',
  ok: 'En stock',
}

// ── LA PÉREMPTION ──────────────────────────────────────────────────────────
//
// Comparaison de CHAÎNES « AAAA-MM-JJ », jamais de Date. Une date de péremption
// est un jour de calendrier : la passer par toISOString() la décale d'un jour
// dès que le navigateur n'est pas au Maroc, et un produit périmé le 31 serait
// annoncé périmé le 30.
export type EtatPeremption = 'perime' | 'proche' | null

/** `jours` : la fenêtre au-delà de laquelle une date ne mérite pas encore
 *  d'être signalée. Soixante jours, parce qu'une commande met des semaines. */
export function etatPeremption(a: ArticleStock, aujourdhui: string, jours = 60): EtatPeremption {
  const p = (a.peremption ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return null
  if (p < aujourdhui) return 'perime'
  if (p <= ajouteJours(aujourdhui, jours)) return 'proche'
  return null
}

/** Ajoute des jours à un « AAAA-MM-JJ » sans jamais quitter le calendrier
 *  local : new Date(y, m-1, d) construit un midi local, pas un instant UTC. */
export function ajouteJours(jour: string, jours: number): string {
  const [y, m, d] = jour.split('-').map(Number)
  const t = new Date(y, m - 1, d + jours)
  const mm = String(t.getMonth() + 1).padStart(2, '0')
  const dd = String(t.getDate()).padStart(2, '0')
  return `${t.getFullYear()}-${mm}-${dd}`
}

// ── CE QU'IL Y A À SIGNALER ─────────────────────────────────────────────────
//
// Un seul calcul, partagé par l'écran du stock et l'encart du tableau de bord.
// Si les deux comptaient de leur côté, le tableau de bord annoncerait « 3 à
// commander » et la page en montrerait quatre.
export interface AlertesStock {
  aCommander: ArticleStock[]
  perimes: ArticleStock[]
  bientotPerimes: ArticleStock[]
  /** Y a-t-il quoi que ce soit à dire ? Un encart vide est ce qui fait qu'on
   *  cesse de regarder un écran. */
  rien: boolean
}

export function alertesStock(articles: ArticleStock[], aujourdhui: string): AlertesStock {
  const vivants = articles.filter((a) => a.actif !== false)
  const aCmd = vivants.filter(aCommander)
  const perimes = vivants.filter((a) => etatPeremption(a, aujourdhui) === 'perime')
  const proches = vivants.filter((a) => etatPeremption(a, aujourdhui) === 'proche')
  return {
    aCommander: aCmd,
    perimes,
    bientotPerimes: proches,
    rien: aCmd.length === 0 && perimes.length === 0 && proches.length === 0,
  }
}

/** La valeur de ce qui dort sur l'étagère. Seuls les articles dont le prix
 *  d'achat est renseigné y entrent : additionner des zéros pour les autres
 *  donnerait un total faux avec l'autorité d'un chiffre. */
export function valeurStock(articles: ArticleStock[]): { total: number; chiffres: number; total_articles: number } {
  const vivants = articles.filter((a) => a.actif !== false)
  const avecPrix = vivants.filter((a) => a.prix_achat != null && Number(a.quantite) > 0)
  const total = avecPrix.reduce((s, a) => s + Number(a.prix_achat) * Number(a.quantite), 0)
  return { total: Math.round(total * 100) / 100, chiffres: avecPrix.length, total_articles: vivants.length }
}

/** Le jour au Maroc, en « AAAA-MM-JJ ». Le Maroc est à UTC+0 une partie de
 *  l'année : on lit les composantes de la date zonée, on ne la sérialise pas. */
export function jourMaroc(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
