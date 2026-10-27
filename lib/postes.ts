// Les POSTES de travail d'un cabinet : fauteuils, salles, box.
//
// ── CE QU'UN POSTE EST, ET N'EST PAS ────────────────────────────────────────
//
// C'est un LIEU, pas un praticien. Deux fauteuils ne dédoublent pas le
// dentiste : ils lui permettent de poser une anesthésie d'un côté pendant
// qu'on détartre de l'autre. La réservation en ligne continue donc de ne
// proposer qu'un patient à la fois et ignore complètement les postes —
// placer un second patient à la même heure est une décision du cabinet, qui
// sait qui fait quoi, pas une porte ouverte dans la page publique.
//
// ── LE POSTE NON PRÉCISÉ EST UN POSTE ───────────────────────────────────────
//
// Un rendez-vous sans poste n'est pas « en attente d'affectation » : c'est le
// cas de tous ceux qui existaient avant, et de tous ceux d'un cabinet à un
// seul fauteuil. Les contraintes de la base le traitent comme un poste à part
// entière (v89), et l'interface aussi.

export interface Poste {
  id: string
  nom: string
  ordre: number
  couleur?: string | null
  actif?: boolean
}

/** Les couleurs proposées pour distinguer les colonnes. Des teintes douces :
 *  une colonne d'agenda se regarde toute la journée. */
export const COULEURS_POSTE = [
  { cle: 'ardoise',   label: 'Ardoise',   point: 'bg-slate-400',   fond: 'bg-slate-50',   bord: 'border-slate-300',   texte: 'text-slate-700' },
  { cle: 'ciel',      label: 'Ciel',      point: 'bg-sky-400',     fond: 'bg-sky-50',     bord: 'border-sky-300',     texte: 'text-sky-700' },
  { cle: 'menthe',    label: 'Menthe',    point: 'bg-emerald-400', fond: 'bg-emerald-50', bord: 'border-emerald-300', texte: 'text-emerald-700' },
  { cle: 'ambre',     label: 'Ambre',     point: 'bg-amber-400',   fond: 'bg-amber-50',   bord: 'border-amber-300',   texte: 'text-amber-700' },
  { cle: 'violet',    label: 'Violet',    point: 'bg-violet-400',  fond: 'bg-violet-50',  bord: 'border-violet-300',  texte: 'text-violet-700' },
  { cle: 'rose',      label: 'Rose',      point: 'bg-rose-400',    fond: 'bg-rose-50',    bord: 'border-rose-300',    texte: 'text-rose-700' },
]

export function couleurPoste(cle?: string | null) {
  return COULEURS_POSTE.find((c) => c.cle === cle) ?? COULEURS_POSTE[0]
}

/** Le cabinet a-t-il de quoi répartir ? Avec zéro ou un poste déclaré, tout
 *  l'affichage lié aux postes reste masqué : une colonne unique intitulée
 *  « Fauteuil 1 » n'apprend rien et encombre. */
export function posteUtile(postes: Poste[]): boolean {
  return postes.filter((p) => p.actif !== false).length >= 2
}

export function posteActifs(postes: Poste[]): Poste[] {
  return postes
    .filter((p) => p.actif !== false)
    .sort((a, b) => (a.ordre - b.ordre) || a.nom.localeCompare(b.nom, 'fr'))
}

/** Le nom à afficher pour un rendez-vous. Un poste supprimé depuis, ou un
 *  identifiant qu'on ne retrouve pas, ne doit pas faire disparaître
 *  l'information : on dit ce qu'on sait. */
export function nomPoste(postes: Poste[], posteId?: string | null): string | null {
  if (!posteId) return null
  return postes.find((p) => p.id === posteId)?.nom ?? 'Poste supprimé'
}

/** Deux rendez-vous se gênent-ils ? Uniquement s'ils partagent le poste. Le
 *  même calcul que la contrainte d'exclusion de la v89, pour que l'écran ne
 *  promette jamais ce que la base refusera. */
export function memePoste(a?: string | null, b?: string | null): boolean {
  return (a ?? null) === (b ?? null)
}

/** La v89 n'est pas passée : pas de migration, pas de fonctionnalité — mais
 *  jamais d'agenda cassé. Des CODES d'erreur seulement, jamais le texte du
 *  message : la leçon du stock, où chercher le nom de la table faisait passer
 *  tout refus légitime pour une base en retard. */
export function tablePostesAbsente(error: { code?: string } | null): boolean {
  if (!error) return false
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
}

export const POSTES_NON_ACTIVES = 'Les postes attendent une migration de la base (v89).'
