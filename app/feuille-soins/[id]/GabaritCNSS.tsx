// La « Feuille de soins dentaires » de la CNSS — Réf. ANAM 1.2.03.01.
//
// Le formulaire officiel lui-même, scanné, rempli par-dessus : voir
// components/shared/FormulaireImprime.tsx. Ce fichier ne contient donc pas de
// mise en page, seulement OÙ chaque valeur se pose sur le scan, en millièmes
// de la largeur de la page.
//
// ── CE QUE LE LOGICIEL ÉCRIT, ET CE QU'IL LAISSE ────────────────────────────
//
// Il remplit la DÉCLARATION du chirurgien dentiste — l'imprimé veut que le
// nom du soigné soit porté par le praticien lui-même : « Le nom et prénom de
// la personne soignée doivent être portés par les praticiens eux mêmes sur
// chaque feuille de soins » —, son IDENTIFICATION, le tableau des actes, le
// schéma dentaire, et son cadre de signature.
//
// Il ne touche pas à « Partie réservée à l'assuré(e) » : l'assuré l'écrit de
// sa main et signe dessous.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { fichierPublic } from '@/lib/fichiers-publics'
import type {
  ActeImprime, BeneficiaireImprime, FeuilleImprimee, PraticienImprime,
} from '@/lib/feuilles-soins'
import type { Organisme } from '@/lib/organismes'

export interface Props {
  organisme: Organisme
  praticien: PraticienImprime
  patientId: string
  beneficiaire: BeneficiaireImprime
  feuille: FeuilleImprimee
  actes: ActeImprime[]
}

const L = 1700
const H = 1200

const jour = (j?: string | null) => {
  const s = String(j ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}
/** Les huit chiffres d'une date, pour les grilles « JJ MM AAAA ». */
const chiffres = (j?: string | null) => jour(j).replace(/\//g, '')
const dh = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

// ── Le schéma dentaire de la page 2 ─────────────────────────────────────────
//
// Les dents ne sont pas sur une grille mais DESSINÉES, en arcade. Chaque
// centre a donc été relevé un par un sur le scan, pour la moitié droite du
// patient ; la moitié gauche en est le miroir, l'imprimé étant symétrique —
// et il porte ses axes pour le dire : H en haut, B en bas, D à gauche du
// dessin, G à droite, c'est-à-dire la droite et la gauche DU PATIENT, qu'on
// regarde en face.
const AXE_X = 753.2
/** Quadrant 1 — haut, droite du patient — des incisives vers le fond. */
const HAUT_DROITE: [number, number][] = [
  [748.6, 340.9], [739.6, 344.3], [732.9, 350.4], [729.0, 360.5],
  [722.3, 371.3], [719.0, 385.3], [715.5, 399.4], [713.0, 415.2],
]
/** Quadrant 2 — haut, gauche du patient. L'arcade dessinée n'est pas
 *  parfaitement symétrique : on relève les deux côtés plutôt que d'en
 *  calculer un par miroir. */
const HAUT_GAUCHE: [number, number][] = [
  [758.8, 340.6], [768.1, 343.9], [774.7, 350.6], [778.3, 360.7],
  [784.9, 372.5], [787.3, 385.4], [791.4, 399.8], [794.2, 416.2],
]
/** Quadrant 3 — bas, gauche du patient. */
const BAS_GAUCHE: [number, number][] = [
  [757.5, 513.7], [765.2, 510.8], [772.6, 506.3], [777.5, 497.5],
  [782.0, 487.1], [786.9, 475.8], [790.1, 460.8], [793.8, 443.7],
]
/** Quadrant 4 — bas, droite du patient. */
const BAS_DROITE: [number, number][] = [
  [749.0, 513.6], [740.4, 511.1], [732.6, 506.9], [727.3, 498.5],
  [723.2, 487.8], [718.4, 476.3], [715.3, 461.2], [712.1, 444.2],
]

const ARCADE: Record<number, [number, number][]> = {
  1: HAUT_DROITE, 2: HAUT_GAUCHE, 3: BAS_GAUCHE, 4: BAS_DROITE,
}

/** Le diamètre du cercle à tracer : les incisives sont étroites, les molaires
 *  larges. Mesuré sur le dessin, du centre vers le fond. */
const DIAMETRE = [9, 11, 12, 13, 15, 16, 17, 18]

/** Le centre d'une dent sur l'arcade dessinée.
 *
 *  Rien pour les dents de LAIT : l'imprimé les dessine à l'intérieur de
 *  l'arcade, minuscules et à contour ouvert par endroits — on ne sait pas les
 *  situer assez sûrement pour marquer un document de remboursement. Leur
 *  numéro figure dans la colonne « Dents traitées », qui est ce que
 *  l'organisme lit ; le praticien entoure la dent au stylo. */
function dentSurArcade(fdi: string | null | undefined): { x: number; y: number; d: number } | null {
  const m = /^([1-4])([1-8])$/.exec(String(fdi ?? '').trim())
  if (!m) return null
  const [x, y] = ARCADE[Number(m[1])][Number(m[2]) - 1]
  return { x, y, d: DIAMETRE[Number(m[2]) - 1] }
}

export default function GabaritCNSS({ praticien, patientId, beneficiaire, feuille, actes }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const coche = (t: string) => feuille.typesSoins.includes(t)

  const page1: MarqueFormulaire[] = [
    // Entente préalable ou exécution, en tête de l'imprimé.
    feuille.nature === 'entente_prealable'
      ? { x: 738, y: 65, signe: 'croix', largeur: 14 }
      : { x: 827, y: 65, signe: 'croix', largeur: 14 },

    // Déclaration du Chirurgien Dentiste — le bénéficiaire des soins.
    { x: 632, y: 262, texte: beneficiaire.nom, taille: 13 },
    { x: 752, y: 280, texte: chiffres(beneficiaire.dateNaissance), pas: 11.06, taille: 11 },
    { x: 759.5, y: 302, texte: beneficiaire.cin, pas: 8.73, taille: 10 },
    ...(beneficiaire.sexe === 'M' ? [{ x: 815, y: 319, signe: 'croix' as const, largeur: 11 }] : []),
    ...(beneficiaire.sexe === 'F' ? [{ x: 869, y: 319, signe: 'croix' as const, largeur: 11 }] : []),

    // Identification du Chirurgien Dentiste.
    { x: 611.4, y: 355, texte: praticien.inpe, pas: 8.8, taille: 10 },
    ...(coche('soins') ? [{ x: 767.5, y: 381, signe: 'croix' as const, largeur: 12 }] : []),
    ...(coche('prothese') ? [{ x: 767.5, y: 397, signe: 'croix' as const, largeur: 12 }] : []),
    ...(coche('orthodontie') ? [{ x: 767.5, y: 413, signe: 'croix' as const, largeur: 12 }] : []),
    ...(coche('autres') ? [{ x: 767.5, y: 428, signe: 'croix' as const, largeur: 12 }] : []),
    { x: 741.8, y: 450, texte: feuille.ententeNo, pas: 8.8, taille: 10 },

    // Le cadre de signature du praticien — celui de droite. Celui de gauche
    // est à l'assuré, et reste vierge.
    { x: 835, y: 504, texte: praticien.ville, taille: 12 },
    { x: 834, y: 523, texte: chiffres(feuille.jour), pas: 10.8, taille: 11 },
  ]

  const LIGNES = [84.7, 107.7, 130.7, 155.1, 178.1, 201.1, 225.5, 248.5, 271.5]
  const page2: MarqueFormulaire[] = [
    ...items.slice(0, LIGNES.length).flatMap((a, i): MarqueFormulaire[] => {
      const y = LIGNES[i]
      return [
        { x: 591.5, y, texte: a.tooth ?? '', taille: 12, ancre: 'middle' },
        { x: 638, y, texte: a.code ?? '', taille: 12, ancre: 'middle' },
        { x: 687, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 10, ancre: 'middle' },
        { x: 737, y, texte: a.coefficient ? `${a.lettre_cle ?? ''} ${a.coefficient}`.trim() : '', taille: 12, ancre: 'middle' },
        { x: 785, y, texte: a.valeur_cle != null ? String(a.valeur_cle) : '', taille: 12, ancre: 'middle' },
        { x: 852, y, texte: dh(a.amount), taille: 12, ancre: 'end' },
      ]
    }),
    // Le libellé de l'acte ne s'écrit nulle part : l'imprimé de l'ANAM ne lui
    // donne pas de colonne — il veut un code et une cotation, pas une phrase.

    // Le schéma : « Le praticien est prié de préciser la dent traitée. »
    ...items.flatMap((a): MarqueFormulaire[] => {
      const d = dentSurArcade(a.tooth)
      return d ? [{ x: d.x, y: d.y, signe: 'cercle', largeur: d.d }] : []
    }),
  ]

  const pages: PageFormulaire[] = [
    { image: fichierPublic('/formulaires/cnss-1.jpg'), largeur: L, hauteur: H, marques: page1 },
    { image: fichierPublic('/formulaires/cnss-2.jpg'), largeur: L, hauteur: H, marques: page2 },
  ]

  return <FormulaireImprime pages={pages} orientation="landscape" retourHref={`/patients/${patientId}`} />
}
