// Parodonte — règles pures, lues par l'écran comme par les routes.
//
// La règle d'or de ce fichier : qu'un relevé ait été saisi par un
// omnipraticien (une poche par dent) ou par un parodontiste (six sites), les
// lectures renvoient la MÊME chose. C'est ce qui permet de comparer deux
// relevés faits par deux praticiens différents — le cas normal d'un cabinet
// multidisciplinaire.

export const PERIO_MODES = ['simple', 'complet'] as const
export type PerioMode = (typeof PERIO_MODES)[number]

/** Les six sites d'une dent, dans l'ordre de relevé : vestibulaire d'abord
 *  (distal, central, mésial), puis palatin/lingual. */
export const PERIO_SITES = ['DV', 'V', 'MV', 'DP', 'P', 'MP'] as const
export type PerioSite = (typeof PERIO_SITES)[number]

/** Au-delà, la poche est pathologique : c'est le seuil qui déclenche le rouge
 *  à l'écran et la proposition de surfaçage. 4 mm = à surveiller, 5 = à traiter. */
export const POCHE_SURVEILLANCE = 4
export const POCHE_PATHOLOGIQUE = 5

export const MOBILITES = [0, 1, 2, 3] as const

/** Ce qui est stocké pour une dent, dans l'un ou l'autre mode. */
export interface PerioDentBrute {
  pdMax?: number | null
  pd?: (number | null)[] | null
  rec?: (number | null)[] | null
  bop?: boolean | (boolean | null)[] | null
  mob?: number | null
}

export type PerioTeeth = Record<string, PerioDentBrute>

/** La vue unifiée d'une dent : ce que l'écran et le document affichent. */
export interface PerioDent {
  /** Poche la plus profonde, en millimètres. */
  pdMax: number | null
  /** Saignement : vrai dès qu'un site saigne. */
  bop: boolean
  /** Mobilité 0 à 3. */
  mob: number | null
  /** Récession maximale, seulement en mode complet. */
  recMax: number | null
  /** Niveau d'attache = poche + récession, au site le plus atteint. */
  cal: number | null
}

const nombre = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 20 ? n : null
}

/** Lecture unique d'une dent, quel que soit le mode de saisie. */
export function lireDent(brute: PerioDentBrute | null | undefined): PerioDent {
  if (!brute || typeof brute !== 'object') {
    return { pdMax: null, bop: false, mob: null, recMax: null, cal: null }
  }

  const pdSites = Array.isArray(brute.pd) ? brute.pd.map(nombre).filter((n): n is number => n !== null) : []
  const recSites = Array.isArray(brute.rec) ? brute.rec.map(nombre).filter((n): n is number => n !== null) : []

  const pdMax = pdSites.length > 0 ? Math.max(...pdSites) : nombre(brute.pdMax)
  const recMax = recSites.length > 0 ? Math.max(...recSites) : null

  // Saignement : un booléen en mode simple, un site qui saigne en mode complet.
  const bop = Array.isArray(brute.bop) ? brute.bop.some((b) => b === true) : brute.bop === true

  // Le niveau d'attache ne se calcule qu'avec la récession : en mode simple,
  // on ne l'invente pas.
  const cal = pdMax !== null && recMax !== null ? pdMax + recMax : null

  return { pdMax, bop, mob: nombre(brute.mob), recMax, cal }
}

/** Les dents réellement mesurées d'un relevé. */
export function dentsMesurees(teeth: PerioTeeth | null | undefined): string[] {
  if (!teeth) return []
  return Object.keys(teeth)
    .filter((k) => {
      const d = lireDent(teeth[k])
      return d.pdMax !== null || d.bop || (d.mob !== null && d.mob > 0)
    })
    .sort((a, b) => Number(a) - Number(b))
}

export interface PerioResume {
  dents: number
  pocheMax: number | null
  /** Dents dont la poche atteint le seuil pathologique. */
  dentsAtteintes: string[]
  /** Pourcentage de dents qui saignent — l'indicateur que suit le praticien. */
  bopPourcent: number | null
  mobiles: string[]
}

/** Le résumé d'un relevé : les quatre chiffres qu'on lit en premier. */
export function resumer(teeth: PerioTeeth | null | undefined): PerioResume {
  const cles = dentsMesurees(teeth)
  if (cles.length === 0) {
    return { dents: 0, pocheMax: null, dentsAtteintes: [], bopPourcent: null, mobiles: [] }
  }
  const lues = cles.map((k) => ({ k, d: lireDent(teeth?.[k]) }))
  const poches = lues.map((x) => x.d.pdMax).filter((n): n is number => n !== null)
  const saignent = lues.filter((x) => x.d.bop).length

  return {
    dents: cles.length,
    pocheMax: poches.length > 0 ? Math.max(...poches) : null,
    dentsAtteintes: lues.filter((x) => (x.d.pdMax ?? 0) >= POCHE_PATHOLOGIQUE).map((x) => x.k),
    bopPourcent: Math.round((saignent / cles.length) * 100),
    mobiles: lues.filter((x) => (x.d.mob ?? 0) > 0).map((x) => x.k),
  }
}

export type Evolution = 'amelioration' | 'aggravation' | 'stable' | 'nouveau'

/** Comparaison d'une dent entre deux relevés. C'est la seule lecture qui
 *  intéresse vraiment le patient : est-ce que ça va mieux ? */
export function comparerDent(avant: PerioDentBrute | undefined, apres: PerioDentBrute | undefined): {
  evolution: Evolution; avant: number | null; apres: number | null; ecart: number | null
} {
  const a = lireDent(avant).pdMax
  const b = lireDent(apres).pdMax
  if (b === null) return { evolution: 'stable', avant: a, apres: b, ecart: null }
  if (a === null) return { evolution: 'nouveau', avant: a, apres: b, ecart: null }
  const ecart = b - a
  return {
    evolution: ecart <= -1 ? 'amelioration' : ecart >= 1 ? 'aggravation' : 'stable',
    avant: a, apres: b, ecart,
  }
}

/** Couleur d'une poche à l'écran : vert sous le seuil, orange à surveiller,
 *  rouge au-delà. Les mêmes trois couleurs que partout dans l'application. */
export function couleurPoche(mm: number | null): 'ok' | 'surveiller' | 'atteinte' | null {
  if (mm === null) return null
  if (mm >= POCHE_PATHOLOGIQUE) return 'atteinte'
  if (mm >= POCHE_SURVEILLANCE) return 'surveiller'
  return 'ok'
}
