// Feuilles de soins — règles partagées entre l'écran, les routes et le document.
//
// Une feuille de soins décrit des actes FAITS, pour que le patient se fasse
// rembourser. Elle ne crée aucune recette (voir l'en-tête de la migration v65),
// et les codes de nomenclature viennent du praticien, jamais du logiciel.
//
// ── CE QUI S'ARRÊTE À LA PORTE DU CABINET ───────────────────────────────────
//
// Le logiciel a porté pendant un temps un suivi du remboursement : établie,
// remise au patient, remboursée, avec les dates, le montant versé et une
// alerte au bout de soixante jours. Cela décrivait un métier qui n'est pas
// celui d'ici. Au Maroc, le patient règle la consultation, tend sa feuille au
// praticien qui la complète de ses codes, la reprend et la dépose lui-même.
// Le cabinet n'apprend jamais si elle a été remboursée, ni de combien : il
// n'avait donc rien de vrai à inscrire dans ces cases, et chaque statut
// affiché était une supposition.
//
// Le logiciel s'arrête maintenant où s'arrête le praticien : la feuille est
// établie, imprimée, rendue. La suite appartient au patient.

export interface LigneFeuille {
  id?: string
  tooth: string | null
  code: string | null
  label: string
  amount: number
  position?: number
}

/** Ce que la v95 ajoute à une ligne : la date de l'acte et sa cotation.
 *
 *  À part, et non fondu dans LigneFeuille, parce que ces colonnes peuvent ne
 *  pas exister : la feuille doit rester établissable tant que la migration
 *  n'est pas passée. La route essaie d'écrire l'ensemble, et retombe sur la
 *  ligne seule si la base ne connaît pas encore ces colonnes. */
export interface CotationLigne {
  acte_date: string | null
  lettre_cle: string | null
  coefficient: number | null
  valeur_cle: number | null
}

/** Montant d'une feuille : la somme de ses lignes, jamais un total saisi à
 *  part — un total qui ne correspond pas au détail fait rejeter le dossier. */
export function totalFeuille(lignes: { amount: number | string }[]): number {
  return lignes.reduce((t, l) => t + (Number(l.amount) || 0), 0)
}

/** Nettoie une ligne venue du navigateur. Une ligne sans libellé n'existe pas. */
export function normaliserLigne(brut: unknown, position: number): LigneFeuille | null {
  if (!brut || typeof brut !== 'object') return null
  const l = brut as Record<string, unknown>
  const label = String(l.label ?? '').trim().slice(0, 160)
  if (!label) return null
  const montant = Number(String(l.amount ?? '0').replace(',', '.'))
  return {
    tooth: l.tooth ? String(l.tooth).trim().slice(0, 4) : null,
    code: l.code ? String(l.code).trim().toUpperCase().slice(0, 20) : null,
    label,
    amount: Number.isFinite(montant) && montant >= 0 ? Math.round(montant * 100) / 100 : 0,
    position,
  }
}

/** Un nombre venu du navigateur, strictement positif, ou null.
 *  Zéro vaut null : un coefficient de 0 ne veut rien dire, et la contrainte
 *  de la v95 le refuserait — autant ne pas l'envoyer. */
function nombrePositif(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** La cotation d'une ligne, nettoyée. Tout y est facultatif : un praticien
 *  qui ne cote pas ses actes doit pouvoir imprimer sa feuille quand même. */
export function normaliserCotation(brut: unknown): CotationLigne {
  const l = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>
  const date = String(l.acte_date ?? '').slice(0, 10)
  const lettre = String(l.lettre_cle ?? '').trim().toUpperCase()
  return {
    acte_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    lettre_cle: /^[A-Z]{1,3}$/.test(lettre) ? lettre : null,
    coefficient: nombrePositif(l.coefficient),
    valeur_cle: nombrePositif(l.valeur_cle),
  }
}

/** Les cases « Type de soins » venues du navigateur.
 *
 *  Les quatre premières sont celles des imprimés DENTAIRES, les quatre
 *  suivantes celles des imprimés MÉDECIN (voir `TypeSoin` dans
 *  lib/organismes.ts). La liste est commune parce que la base stocke un
 *  tableau de mots : c'est l'organisme ET la profession qui disent lesquels
 *  ont un sens, et c'est le gabarit qui décide où les imprimer. */
export const TYPES_SOINS = [
  'soins', 'prothese', 'orthodontie', 'autres',
  'maladie', 'maternite', 'hospitalisation', 'accident',
] as const
export type TypeSoinFeuille = (typeof TYPES_SOINS)[number]

export function normaliserTypesSoins(brut: unknown): TypeSoinFeuille[] {
  if (!Array.isArray(brut)) return []
  const vus = new Set<TypeSoinFeuille>()
  for (const v of brut) {
    const t = String(v ?? '').trim().toLowerCase()
    if ((TYPES_SOINS as readonly string[]).includes(t)) vus.add(t as TypeSoinFeuille)
  }
  return Array.from(vus)
}

/** Champs de l'assuré venus du navigateur : on garde des paires texte courtes,
 *  on jette le reste. La liste des clés attendues vit dans lib/organismes.ts,
 *  mais la base ne doit rien avaler d'autre que du texte. */
export function nettoyerDonneesAssure(brut: unknown): Record<string, string> {
  if (!brut || typeof brut !== 'object') return {}
  const sortie: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (!/^[a-z_]{1,32}$/.test(cle)) continue
    const texte = String(valeur ?? '').trim().slice(0, 120)
    if (texte) sortie[cle] = texte
  }
  return sortie
}


// ── Ce qu'un gabarit imprimé reçoit ─────────────────────────────────────────
//
// Les quatre imprimés diffèrent par leur trame, pas par leurs données : les
// mêmes actes, le même praticien, le même bénéficiaire. Ces formes sont donc
// communes aux gabarits ANAM, RMA et FAR.

/** Un acte tel qu'il part à l'impression : la ligne de la feuille, plus sa
 *  cotation quand la v95 est passée. */
export interface ActeImprime {
  tooth: string | null
  code: string | null
  label: string
  amount: number
  position: number
  acte_date?: string | null
  lettre_cle?: string | null
  coefficient?: number | string | null
  valeur_cle?: number | string | null
}

/** Le praticien, tel que les formulaires l'identifient. */
export interface PraticienImprime {
  nom: string
  specialite: string | null
  adresse: string | null
  telephone: string | null
  inpe: string | null
  ice: string | null
  identifiantFiscal: string | null
  ville: string | null
}

/** Le bénéficiaire des soins — le patient. */
export interface BeneficiaireImprime {
  nom: string
  dateNaissance: string | null
  cin: string | null
  sexe: string | null
}

/** Ce que la feuille elle-même déclare. */
export interface FeuilleImprimee {
  jour: string
  nature: 'execution' | 'entente_prealable'
  typesSoins: string[]
  ententeNo: string | null
  total: number
}
