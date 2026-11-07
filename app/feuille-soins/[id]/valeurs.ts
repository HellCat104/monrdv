// Ce qu'on écrit dans les cases d'un imprimé officiel : mise en forme, et
// rien d'autre.
//
// ── POURQUOI UN FICHIER À PART ──────────────────────────────────────────────
//
// Les quatre gabarits dentaires portaient chacun leur propre `jour()`,
// `chiffres()` et `dh()`. Trois de plus pour les imprimés « médecin » en
// auraient fait sept copies — sept endroits où corriger le jour où un
// organisme demande un format différent. Les gabarits médecin partagent donc
// ces fonctions ; les gabarits dentaires gardent les leurs, qui marchent, et
// qu'on ne touche pas pour le plaisir de factoriser.
//
// ── CE QUI N'EST PAS ICI ────────────────────────────────────────────────────
//
// Aucune règle métier : ni tarif, ni code de nomenclature, ni valeur de clé.
// On met en forme ce que le praticien a saisi, jamais plus.
import type { MarqueFormulaire } from '@/components/shared/FormulaireImprime'

/** « 2026-03-07 » → « 07/03/2026 ». Vide si la date n'en est pas une.
 *
 *  Découpage de la chaîne, jamais `new Date()` : le Maroc est à UTC+0 et une
 *  date de calendrier passée par `toISOString()` recule d'un jour dès que le
 *  serveur ne l'est pas. */
export const jour = (j?: string | null): string => {
  const s = String(j ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}

/** Les huit chiffres d'une date : « 07032026 ». Pour les grilles de cases. */
export const chiffres = (j?: string | null): string => jour(j).replace(/\//g, '')

/** Les six chiffres d'une date : « 070326 ». Le CNOPS ne donne que six cases
 *  à la date de naissance du bénéficiaire — le siècle n'y rentre pas. */
export const chiffres6 = (j?: string | null): string => {
  const c = chiffres(j)
  return c ? c.slice(0, 4) + c.slice(6) : ''
}

/** Un montant en dirhams, à la française : « 1 250,00 ». */
export const dh = (n: number): string =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

/**
 * Une valeur écrite case par case, sur une grille dont les cases ne sont PAS
 * régulièrement espacées.
 *
 * `MarqueFormulaire.pas` suffit quand la grille est régulière. Les imprimés
 * de l'assurance maladie groupent souvent leurs cases — « JJ | MM | AAAA »,
 * avec un blanc entre les groupes — et un pas constant y dérive dès le
 * troisième chiffre. On relève alors le centre de CHAQUE case, une fois, et
 * on les passe ici.
 *
 * Les caractères en trop sont abandonnés plutôt que débordés : une date qui
 * sort du cadre est illisible pour la caisse, et une date tronquée se voit.
 */
export function cases(
  centres: number[], y: number, valeur: string | null | undefined, taille = 11,
): MarqueFormulaire[] {
  return String(valeur ?? '').replace(/\s/g, '').split('').slice(0, centres.length)
    .map((c, i) => ({ x: centres[i], y, texte: c, taille, ancre: 'middle' as const }))
}

/**
 * Une valeur répartie sur une grille RÉGULIÈRE, dont on connaît les deux
 * bords.
 *
 * Pourquoi pas un pas fixe : une grille a un nombre de cases fixe, la valeur
 * pas toujours. Le peigne « INPE » de la CNSS en a neuf, celui du CNOPS neuf
 * aussi, et un INPE marocain en compte parfois dix. Avec un pas constant, le
 * dixième chiffre sortait du cadre et s'imprimait dans la marge — on l'a vu.
 *
 * Ici, la valeur est répartie sur la largeur disponible : à la bonne longueur
 * elle tombe case par case, trop longue elle se resserre et reste LISIBLE ET
 * ENTIÈRE. Un INPE amputé d'un chiffre fait rejeter le dossier ; un INPE un
 * peu serré, non.
 */
export function grille(
  debut: number, fin: number, y: number, valeur: string | null | undefined, tailleMax = 11,
): MarqueFormulaire[] {
  const v = String(valeur ?? '').replace(/\s/g, '')
  if (!v) return []
  const pas = (fin - debut) / v.length
  const taille = Math.min(tailleMax, pas * 0.95)
  return v.split('').map((c, i) => ({
    x: debut + pas * (i + 0.5), y, texte: c, taille, ancre: 'middle' as const,
  }))
}

/** La cotation telle que l'imprimé la veut : « C 1,5 », « K 20 ».
 *  Vide si le praticien n'a pas coté — il complétera à la main. */
export function cotation(lettre?: string | null, coefficient?: number | string | null): string {
  const c = coefficient == null || coefficient === '' ? '' : String(coefficient).replace('.', ',')
  return `${lettre ?? ''} ${c}`.trim()
}
