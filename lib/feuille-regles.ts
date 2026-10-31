// Ce qui ferait rejeter la feuille, dit AVANT qu'elle sorte du cabinet.
//
// ── POURQUOI CET ÉCRAN EXISTE ───────────────────────────────────────────────
//
// Une feuille de soins mal constituée ne revient pas tout de suite : elle
// revient six semaines plus tard, par le patient, avec une phrase vague. Le
// cabinet refait le dossier, et le patient a attendu pour rien. Les causes
// sont presque toujours les mêmes, et elles sont toutes écrites noir sur
// blanc sur les formulaires et dans le référentiel de l'ANAM :
//
//   · le délai de dépôt est passé ;
//   · une radiographie exigée par le référentiel n'est pas jointe ;
//   · la radiographie « avant » a plus de six mois ;
//   · l'acte relevait d'un accord préalable qu'on n'a pas demandé ;
//   · l'INPE du praticien ne figure pas sur l'imprimé.
//
// Le logiciel sait chacune de ces cinq choses. Il les dit.
//
// ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
//
// Il n'EMPÊCHE rien. Le praticien connaît son dossier mieux que le logiciel :
// la radio peut être sur son autre poste, l'accord peut avoir été obtenu par
// téléphone, l'organisme peut tolérer un jour de retard. Une alerte se lit et
// se passe outre. Un logiciel qui bloque sur une règle qu'il a mal comprise
// est un logiciel qu'on abandonne.

import type { Organisme } from '@/lib/organismes'
import {
  MOIS_VALIDITE_RADIO, actesSousAccord, familleDuCode, piecesAJoindre,
} from '@/lib/nomenclature-anam'
import { imagesDeLaDent, jourImage, type ImageDentaire } from '@/lib/imagerie'

export interface ActeFeuille {
  tooth: string | null
  code: string | null
  label: string
  amount: number
  acte_date?: string | null
  lettre_cle?: string | null
  coefficient?: number | string | null
  valeur_cle?: number | string | null
}

/** Une ligne est cotée quand elle porte une lettre clé ET un coefficient.
 *  La valeur de la clé n'en fait pas partie : certains praticiens la laissent
 *  à l'organisme, qui applique son tarif de référence. */
function aUneCotation(a: ActeFeuille): boolean {
  return !!String(a.lettre_cle ?? '').trim() && Number(a.coefficient) > 0
}

export type NiveauAlerte = 'bloquant' | 'attention' | 'info'

export interface AlerteFeuille {
  niveau: NiveauAlerte
  titre: string
  detail: string
}

// ── Dates ───────────────────────────────────────────────────────────────────
// Toujours en composantes « AAAA-MM-JJ », jamais par un objet Date sérialisé :
// une date de calendrier passée par toISOString() recule d'un jour dès que le
// navigateur n'est pas au Maroc.

const EST_JOUR = /^\d{4}-\d{2}-\d{2}$/

/** Le même jour, N mois plus tard. Un 31 reporté sur un mois court tombe sur
 *  le dernier jour de ce mois — c'est ainsi que se comptent « deux mois » sur
 *  un guichet, et non en 60 jours fixes. */
export function ajouterMois(jour: string, mois: number): string {
  if (!EST_JOUR.test(jour)) return jour
  const [a, m, j] = jour.split('-').map(Number)
  const cible = new Date(Date.UTC(a, m - 1 + mois, 1))
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate()
  const jj = Math.min(j, dernier)
  const mm = cible.getUTCMonth() + 1
  return `${cible.getUTCFullYear()}-${String(mm).padStart(2, '0')}-${String(jj).padStart(2, '0')}`
}

/** Jours entre deux « AAAA-MM-JJ ». Négatif si le second est antérieur. */
export function joursEntre(depuis: string, jusqua: string): number {
  if (!EST_JOUR.test(depuis) || !EST_JOUR.test(jusqua)) return 0
  const [ya, ma, da] = depuis.split('-').map(Number)
  const [yb, mb, db] = jusqua.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

/** Le jour d'un acte : le sien, ou à défaut celui de la feuille. */
export function jourActe(acte: ActeFeuille, jourFeuille: string): string {
  const j = (acte.acte_date ?? '').slice(0, 10)
  return EST_JOUR.test(j) ? j : jourFeuille
}

/** Le premier et le dernier acte portés sur la feuille. */
export function bornesActes(actes: ActeFeuille[], jourFeuille: string): { premier: string; dernier: string } {
  const jours = actes.map((a) => jourActe(a, jourFeuille)).filter((j) => EST_JOUR.test(j)).sort()
  if (jours.length === 0) return { premier: jourFeuille, dernier: jourFeuille }
  return { premier: jours[0], dernier: jours[jours.length - 1] }
}

/** La date limite de dépôt chez cet organisme.
 *
 *  Le point de départ n'est pas le même partout, et ce n'est pas un détail :
 *  la CNSS compte à partir du PREMIER acte, RMA à partir de la CESSATION des
 *  soins. Sur une feuille qui couvre deux mois de traitement, cela change la
 *  date limite de deux mois. */
export function dateLimiteDepot(
  org: Organisme,
  actes: ActeFeuille[],
  jourFeuille: string,
): { jour: string; depuis: string } {
  const { premier, dernier } = bornesActes(actes, jourFeuille)
  const depart = org.delai.depuis === 'premier_acte' ? premier : dernier
  return { jour: ajouterMois(depart, org.delai.mois), depuis: depart }
}

// ── Les alertes ─────────────────────────────────────────────────────────────

/** Au-delà de ce reste, le délai n'inquiète personne et l'alerte se tairait
 *  mieux. En deçà, elle vaut d'être lue : rassembler des radios et faire
 *  signer un patient prend plus de quinze jours en pratique. */
export const JOURS_AVANT_ALERTE_DELAI = 15

export interface ContexteFeuille {
  organisme: Organisme
  actes: ActeFeuille[]
  /** Date d'établissement, « AAAA-MM-JJ ». */
  jourFeuille: string
  aujourdhui: string
  /** L'imagerie du patient (v94). Vide = on ne vérifie pas les radios :
   *  l'absence d'images ne prouve pas qu'il n'y en a pas, elle prouve que le
   *  praticien ne les range pas ici. */
  images?: ImageDentaire[]
  /** L'INPE du praticien, tel qu'il est dans ses paramètres. */
  inpe?: string | null
  /** La feuille demande-t-elle un accord préalable, plutôt que de déclarer
   *  des actes faits ? */
  ententePrealable?: boolean
  /** Le numéro d'accord déjà obtenu, s'il y en a un. */
  ententeNo?: string | null
}

export function alertesFeuille(ctx: ContexteFeuille): AlerteFeuille[] {
  const { organisme: org, actes, jourFeuille, aujourdhui } = ctx
  const alertes: AlerteFeuille[] = []
  const codes = actes.map((a) => a.code)

  // 1. L'INPE. Exigé « sur tous les imprimés AMO » par le référentiel, et la
  //    mutuelle des FAR en fait une condition explicite. Sans lui, l'imprimé
  //    part incomplet et revient.
  const amo = org.cle === 'cnss' || org.cle === 'cnops' || org.cle === 'far'
  if (amo && !(ctx.inpe ?? '').trim()) {
    alertes.push({
      niveau: 'bloquant',
      titre: 'Votre INPE manque',
      detail: 'Le code INPE est obligatoire sur tous les imprimés de l\'assurance maladie obligatoire. Renseignez-le dans vos paramètres : il s\'imprimera ensuite tout seul sur chaque feuille.',
    })
  }

  // 2. Le délai de dépôt.
  if (!ctx.ententePrealable) {
    const limite = dateLimiteDepot(org, actes, jourFeuille)
    const reste = joursEntre(aujourdhui, limite.jour)
    if (reste < 0) {
      alertes.push({
        niveau: 'bloquant',
        titre: `Délai de dépôt dépassé depuis ${-reste} jour${-reste > 1 ? 's' : ''}`,
        detail: org.delai.texte,
      })
    } else if (reste <= JOURS_AVANT_ALERTE_DELAI) {
      alertes.push({
        niveau: 'attention',
        titre: reste === 0
          ? 'Dernier jour pour déposer ce dossier'
          : `Plus que ${reste} jour${reste > 1 ? 's' : ''} pour déposer ce dossier`,
        detail: org.delai.texte,
      })
    }
  }

  // 3. L'accord préalable. Le référentiel le réclame pour l'orthodontie ;
  //    chaque assureur y ajoute le sien, dans ses propres mots.
  const sousAccord = actesSousAccord(codes)
  if (sousAccord.length > 0 && !ctx.ententePrealable && !(ctx.ententeNo ?? '').trim()) {
    alertes.push({
      niveau: 'attention',
      titre: 'Ces actes passent normalement par un accord préalable',
      detail: `${sousAccord.join(', ')}. Portez le numéro de l'accord obtenu sur la feuille, ou établissez d'abord une demande d'entente préalable.`,
    })
  }

  // 4. Les radiographies exigées par le référentiel.
  for (const piece of piecesAJoindre(codes)) {
    if (piece.piece.verifiable === 'radio_avant') {
      alertes.push(...alertesRadioAvant(ctx, piece.pour))
    } else {
      alertes.push({
        niveau: 'info',
        titre: `À joindre : ${piece.piece.libelle.toLowerCase()}`,
        detail: `Exigé pour : ${piece.pour.join(', ')}.`,
      })
    }
  }

  // 5. La cotation. Les formulaires de l'ANAM et de RMA ont une colonne
  //    « Lettre clé + Cotation » et une colonne « Valeur Clé ». Une ligne
  //    sans coefficient part avec des cases vides, et c'est le premier motif
  //    de renvoi d'un dossier.
  if (org.colonneCotation) {
    const sansCotation = actes.filter((a) => a.label.trim() && !aUneCotation(a))
    if (sansCotation.length === actes.length && actes.length > 0) {
      alertes.push({
        niveau: 'attention',
        titre: 'Aucun acte n\'est coté',
        detail: `Le formulaire ${org.nom} demande la lettre clé, le coefficient et la valeur de la clé pour chaque acte. Sans eux, les colonnes sortiront vides et vous devrez les remplir à la main.`,
      })
    } else if (sansCotation.length > 0) {
      alertes.push({
        niveau: 'attention',
        titre: `${sansCotation.length} acte${sansCotation.length > 1 ? 's' : ''} sans cotation`,
        detail: `${sansCotation.map((a) => a.label).join(', ')}. Les colonnes « Lettre clé + Cotation » et « Valeur Clé » sortiront vides pour ${sansCotation.length > 1 ? 'ces lignes' : 'cette ligne'}.`,
      })
    }
  }

  // 6. Les règles propres à l'organisme, citées pour mémoire quand elles
  //    peuvent s'appliquer — elles dépendent de l'âge ou du contrat, que le
  //    logiciel ne doit pas trancher à la place du praticien.
  if (org.accordPrealable.length > 0 && aUnActeLourd(codes)) {
    alertes.push({
      niveau: 'info',
      titre: `Ce que ${org.nom} demande avant de poser`,
      detail: org.accordPrealable.join(' '),
    })
  }

  return alertes
}

/** La feuille porte-t-elle une prothèse ou un traitement d'orthodontie ?
 *  C'est ce qui déclenche, chez tous les organismes, la question de l'accord. */
function aUnActeLourd(codes: (string | null | undefined)[]): boolean {
  return codes.some((c) => {
    const f = familleDuCode(c)
    return !!f && /proth|orthodontie|maxillo/i.test(f.cle + ' ' + f.libelle)
  })
}

/** La radiographie « avant » : présente, et datée de moins de six mois.
 *
 *  Le référentiel est net — « la date de la radio (avant) justifiant un acte
 *  ne doit pas dépasser 6 mois par rapport à la date d'exécution de ce
 *  dernier, à défaut l'acte ne sera pas remboursé ». Depuis la v94, chaque
 *  image porte sa date d'examen et les dents qu'elle montre : c'est la seule
 *  règle que le logiciel peut vérifier lui-même, et il la vérifie dent par
 *  dent. */
function alertesRadioAvant(ctx: ContexteFeuille, pour: string[]): AlerteFeuille[] {
  const images = ctx.images ?? []
  const sorties: AlerteFeuille[] = []
  // Sans imagerie rangée dans MonRDV, on ne conclut rien : on rappelle la
  // pièce. Conclure « il manque une radio » parce que le praticien classe ses
  // clichés ailleurs serait une alerte fausse, et les alertes fausses
  // apprennent à ignorer les vraies.
  if (images.length === 0) {
    return [{
      niveau: 'info',
      titre: 'À joindre : radiographie avant l\'acte',
      detail: `Exigé pour : ${pour.join(', ')}. Elle doit dater de moins de ${MOIS_VALIDITE_RADIO} mois au jour de l'acte.`,
    }]
  }

  for (const acte of ctx.actes) {
    const famille = familleDuCode(acte.code)
    if (!famille?.pieces.some((p) => p.verifiable === 'radio_avant')) continue
    if (!acte.tooth) continue
    const jour = jourActe(acte, ctx.jourFeuille)
    const candidates = imagesDeLaDent(images, acte.tooth)
      .filter((img) => jourImage(img).jour <= jour)
    if (candidates.length === 0) {
      sorties.push({
        niveau: 'attention',
        titre: `Dent ${acte.tooth} : aucune radiographie avant l'acte`,
        detail: `${famille.libelle} exige une radiographie antérieure à l'acte. Aucune image de cette dent n'est rangée dans le dossier avant le ${jour}.`,
      })
      continue
    }
    // La plus récente antérieure à l'acte : c'est celle qui le justifie.
    const { jour: jourRadio, estime } = jourImage(candidates[0])
    const limite = ajouterMois(jourRadio, MOIS_VALIDITE_RADIO)
    if (joursEntre(limite, jour) > 0) {
      sorties.push({
        niveau: 'attention',
        titre: `Dent ${acte.tooth} : la radiographie a plus de ${MOIS_VALIDITE_RADIO} mois`,
        detail: `Le cliché date du ${jourRadio}${estime ? ' (date d\'envoi, faute de date d\'examen)' : ''}, l\'acte du ${jour}. Au-delà de ${MOIS_VALIDITE_RADIO} mois, le référentiel de l\'ANAM prévoit que l\'acte ne sera pas remboursé.`,
      })
    }
  }
  return sorties
}

/** Le montant qui sera remboursé, quand on connaît la cotation.
 *
 *  coefficient × valeur de la clé. Le reste à charge du patient est la
 *  différence avec ce qui lui a été facturé. Rend null dès qu'une des deux
 *  valeurs manque : annoncer un remboursement à partir d'une moitié de
 *  cotation reviendrait à promettre un chiffre au patient. */
export function montantRemboursable(
  coefficient: number | string | null | undefined,
  valeurCle: number | string | null | undefined,
): number | null {
  const c = Number(coefficient)
  const v = Number(valeurCle)
  if (!Number.isFinite(c) || !Number.isFinite(v) || c <= 0 || v <= 0) return null
  return Math.round(c * v * 100) / 100
}
