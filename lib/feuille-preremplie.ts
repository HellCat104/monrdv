// La feuille de soins arrive PRÊTE : les actes de la séance, cotés.
//
// Le dentiste soigne, puis ouvre la feuille. Il ne doit pas y retrouver une
// ligne « Bilan parodontal — » sans code ni coefficient à compléter : le
// logiciel SAIT ce qu'il a fait pendant la séance — il l'a noté sur le schéma
// dentaire — et il connaît la cotation officielle de chaque acte
// (lib/actes-dentaires.ts). Ce module fait la jonction, sans rien deviner :
//
//   - un soin n'entre sur la feuille que s'il a été marqué RÉALISÉ pendant CE
//     rendez-vous. Une carie « constatée » n'est pas un acte ; une
//     obturation notée il y a six mois non plus.
//   - un état qui n'a pas d'acte à la nomenclature (implant, mobilité,
//     fracture) ne produit pas de ligne : on ne cote pas ce qui n'existe pas.
//
// Le praticien relit, corrige, ajoute. Mais il ne recopie plus.
import type { ToothEvent } from '@/lib/dental-history'
import type { ToothStatus } from '@/lib/dental'
import { acteParCode, canalairePourDent, cotationDe } from '@/lib/actes-dentaires'

export interface ActeDeSeance {
  tooth: string
  code: string
}

const estLait = (tooth: string) => Math.floor(Number(tooth) / 10) >= 5

/** L'obturation selon le nombre de faces : 1 face D700, 2 faces D701, 3 et
 *  plus D702. Sans face notée, on retient la cavité simple. */
function obturationPourFaces(n: number): string {
  if (n >= 3) return 'D702'
  if (n === 2) return 'D701'
  return 'D700'
}

/** Les actes que le schéma dentaire a vu RÉALISER pendant ce rendez-vous.
 *
 *  Pour chaque dent, on lit le dernier état connu dans la séance. Une carie
 *  passée à « réalisé » et une obturation réalisée sur la même dent font UNE
 *  obturation, au plus grand nombre de faces. Deux extractions de la même
 *  séance : la première se cote D713, les suivantes D714 (« chacune des
 *  suivantes au cours de la même séance ») ; même règle pour les dents de lait
 *  (D715 puis D716). */
export function actesDeLaSeance(events: ToothEvent[], appointmentId: string | null): ActeDeSeance[] {
  if (!appointmentId) return []
  const parDent = new Map<string, Set<string>>()
  const faces = new Map<string, number>()

  // Du plus ancien au plus récent : un geste annulé dans la séance (réalisé
  // puis remis « à faire ») ne doit pas rester sur la feuille.
  const seance = events
    .filter((e) => e.appointment_id === appointmentId)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  for (const e of seance) {
    const realises = new Set<string>()
    for (const s of e.states_after) {
      if (e.natures_after?.[s] !== 'realise') continue
      realises.add(s)
      if (s === 'carie' || s === 'obturation') {
        const n = (e.faces_after?.[s as ToothStatus] ?? []).length
        faces.set(e.tooth, Math.max(faces.get(e.tooth) ?? 0, n))
      }
    }
    // Le dernier état de la dent dans la séance remplace le précédent.
    parDent.set(e.tooth, realises)
  }

  const actes: ActeDeSeance[] = []
  let extractions = 0
  let extractionsLait = 0
  const dents = Array.from(parDent.keys()).sort((a, b) => Number(a) - Number(b))
  for (const tooth of dents) {
    const r = parDent.get(tooth)!
    if (r.has('extraite') || r.has('a_extraire')) {
      if (estLait(tooth)) actes.push({ tooth, code: extractionsLait++ === 0 ? 'D715' : 'D716' })
      else actes.push({ tooth, code: extractions++ === 0 ? 'D713' : 'D714' })
      continue // une dent extraite n'a plus d'autre soin à coter
    }
    if (r.has('endodontie')) actes.push({ tooth, code: canalairePourDent(tooth) })
    if (r.has('carie') || r.has('obturation')) actes.push({ tooth, code: obturationPourFaces(faces.get(tooth) ?? 0) })
    if (r.has('bridge')) actes.push({ tooth, code: 'D757' })
    else if (r.has('couronne')) actes.push({ tooth, code: 'D754' })
  }
  return actes
}

export interface CotationMemorisee {
  lettre_cle: string | null
  coefficient: number | null
  valeur_cle: number | null
}

export interface LignePrete {
  code: string
  label: string
  lettreCle: string
  coefficient: string
  valeurCle: string
  amount: string
}

const texte = (n: number | null | undefined) => (n != null && n > 0 ? String(n) : '')

/** Une ligne de feuille, cotée.
 *
 *  - Code de la NGAP : la cotation OFFICIELLE (lettre, coefficient, valeur de
 *    la clé). Ce que le cabinet a pu taper autrefois sur ce code ne passe pas
 *    devant le texte.
 *  - Code hors nomenclature, ou consultation : la dernière cotation que le
 *    cabinet a portée sur ce code.
 *  - Montant : le dernier montant facturé par le cabinet pour ce code, sinon
 *    le tarif de référence, sinon celui que l'appelant connaît. */
export function ligneCotee(
  code: string,
  { tarifs = {}, cotations = {}, label, montant }: {
    tarifs?: Record<string, number>
    cotations?: Record<string, CotationMemorisee>
    label?: string
    montant?: number | null
  } = {},
): LignePrete {
  const cle = code.trim().toUpperCase()
  const acte = acteParCode(cle)
  const officielle = cotationDe(cle)
  const memo = cotations[cle]
  const lettreCle = officielle?.lettreCle || memo?.lettre_cle || ''
  // La consultation se cote « C » sans multiplicateur : coefficient 1.
  const coefficient = officielle?.coefficient ?? memo?.coefficient ?? (lettreCle === 'C' || lettreCle === 'V' ? 1 : null)
  const valeurCle = officielle?.valeurCle ?? memo?.valeur_cle ?? null
  const prix = tarifs[cle] ?? (montant && montant > 0 ? montant : null) ?? officielle?.tnr ?? null
  return {
    code: acte?.code ?? code.trim(),
    label: label?.trim() || acte?.libelle || code.trim(),
    lettreCle,
    coefficient: texte(coefficient),
    valeurCle: texte(valeurCle),
    amount: texte(prix),
  }
}

/** Le code du catalogue dont le libellé est exactement celui-ci, aux accents
 *  et aux espaces près. Sert aux actes du plan de traitement, qui portent un
 *  libellé et pas de code. */
export function codeDuLibelle(label: string, catalogue: { libelle: string; code: string }[]): string | null {
  const norme = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  const cible = norme(label)
  return catalogue.find((a) => norme(a.libelle) === cible)?.code ?? null
}
