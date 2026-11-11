// La COULEUR D'UN MOTIF de consultation.
//
// ── CE QU'ELLE SERT À LIRE ──────────────────────────────────────────────────
//
// Un agenda de dentiste n'est pas une suite de rendez-vous interchangeables :
// un détartrage de vingt minutes et une pose de couronne d'une heure ne se
// préparent pas pareil, et l'assistante qui ouvre l'écran à 8 h veut savoir
// de quoi sa journée est faite avant d'en lire les libellés un par un. Une
// couleur par motif répond à cette question d'un coup d'œil.
//
// ── POURQUOI LES CLASSES SONT ÉCRITES EN TOUTES LETTRES ─────────────────────
//
// Même leçon que les postes (lib/postes.ts) : Tailwind ne génère que les
// classes qu'il VOIT écrites dans le code. Une classe fabriquée au moment du
// rendu — `bg-${couleur}-50` — n'existe nulle part dans la feuille de style,
// et tous les rendez-vous ressortent de la même teinte, sans la moindre
// erreur pour le dire.
//
// ── CE QUI N'EST PAS UNE COULEUR DE MOTIF ───────────────────────────────────
//
// L'agenda a déjà trois teintes qui veulent dire quelque chose : le gris
// barré d'un patient absent, l'ambre d'un rendez-vous en attente de
// confirmation, le rouge d'une plage bloquée. Elles PASSENT AVANT la couleur
// du motif : savoir qu'un patient n'est pas venu compte plus que savoir ce
// qu'il venait faire.
//
// Le BLEU CIEL est exclu pour la même raison, moins évidente : la couleur
// principale de MonRDV est très exactement `sky-500`, et le rendez-vous qui
// n'a pas de couleur s'affiche en `primary-50`, c'est-à-dire `sky-50`. Un
// motif peint en bleu ciel aurait donc eu l'apparence d'un motif SANS
// couleur — vérifié à l'écran avant de le retirer de la palette.

export interface CouleurMotif {
  cle: string
  label: string
  /** La pastille ronde des listes et du calendrier. */
  point: string
  /** Le fond d'un bloc d'agenda ou d'une étiquette. */
  fond: string
  /** Le cadre du bloc. */
  bord: string
  /** Le texte posé sur ce fond. */
  texte: string
}

/** Huit teintes, et pas davantage : au-delà, deux motifs se ressemblent et la
 *  couleur cesse d'informer. Elles sont douces — un agenda se regarde toute
 *  la journée.
 *
 *  L'ambre et le rouge franc n'y sont pas : ce sont les couleurs de
 *  « en attente » et « bloqué » dans cet écran, et les réemployer pour un
 *  motif ferait lire un état là où il n'y en a pas. */
export const COULEURS_MOTIF: CouleurMotif[] = [
  { cle: 'fuchsia',  label: 'Fuchsia',   point: 'bg-fuchsia-400', fond: 'bg-fuchsia-50', bord: 'border-fuchsia-300', texte: 'text-fuchsia-800' },
  { cle: 'menthe',   label: 'Menthe',    point: 'bg-emerald-400', fond: 'bg-emerald-50', bord: 'border-emerald-300', texte: 'text-emerald-800' },
  { cle: 'violet',   label: 'Violet',    point: 'bg-violet-400',  fond: 'bg-violet-50',  bord: 'border-violet-300',  texte: 'text-violet-800' },
  { cle: 'rose',     label: 'Rose',      point: 'bg-rose-400',    fond: 'bg-rose-50',    bord: 'border-rose-300',    texte: 'text-rose-800' },
  { cle: 'turquoise',label: 'Turquoise', point: 'bg-teal-400',    fond: 'bg-teal-50',    bord: 'border-teal-300',    texte: 'text-teal-800' },
  { cle: 'indigo',   label: 'Indigo',    point: 'bg-indigo-400',  fond: 'bg-indigo-50',  bord: 'border-indigo-300',  texte: 'text-indigo-800' },
  { cle: 'citron',   label: 'Citron',    point: 'bg-lime-500',    fond: 'bg-lime-50',    bord: 'border-lime-300',    texte: 'text-lime-800' },
  { cle: 'ardoise',  label: 'Ardoise',   point: 'bg-slate-400',   fond: 'bg-slate-50',   bord: 'border-slate-300',   texte: 'text-slate-700' },
]

/** La couleur d'un motif, ou `null` s'il n'en a pas.
 *
 *  `null` et non une couleur par défaut : un cabinet qui n'a rien choisi doit
 *  garder l'agenda qu'il connaît. La couleur se décide, elle ne s'impose pas. */
export function couleurMotif(cle?: string | null): CouleurMotif | null {
  if (!cle) return null
  return COULEURS_MOTIF.find((c) => c.cle === cle) ?? null
}

/** La couleur du rendez-vous, s'il en a une. On passe par le motif rattaché,
 *  tel que l'agenda le charge déjà (`consultation_type:consultation_types(*)`). */
export function couleurDuRdv(
  apt: { consultation_type?: { couleur?: string | null } | null },
): CouleurMotif | null {
  return couleurMotif(apt.consultation_type?.couleur ?? null)
}

/** La colonne `couleur` manque : la v98 n'est pas passée. Des CODES d'erreur
 *  seulement, jamais le texte du message. */
export function colonneCouleurAbsente(error: { code?: string } | null): boolean {
  if (!error) return false
  return ['42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
}
