// La « Déclaration dentaire » de RMA Watanya — FOR-GM-022, version 2019.
//
// Le formulaire officiel lui-même, scanné, rempli par-dessus : voir
// components/shared/FormulaireImprime.tsx. Ce fichier ne contient pas de mise
// en page, seulement OÙ chaque valeur se pose, en millièmes de la largeur de
// la page.
//
// ── CE QUE CET IMPRIMÉ A DE PARTICULIER ────────────────────────────────────
//
// Il sépare les SOINS des PROTHÈSES ET DE L'ODF, en deux tableaux qui ne
// demandent pas les mêmes colonnes ; et le second distingue ce qu'on PROPOSE
// de ce qu'on EXÉCUTE, en deux groupes de lignes. C'est la demande d'accord
// préalable de RMA, sur la même page que les travaux faits.
//
// ── REMPLI AU MAXIMUM (novembre 2026) ──────────────────────────────────────
//
// Page 1 : type de déclaration, n° d'affiliation case par case, souscripteur,
// n° de police, assuré (nom, adresse), malade (nom, lien de parenté), montant
// des frais, « Fait à … le … » — tout ce que la fiche patient sait (bloc
// « Assuré »). Seule la signature de l'assuré reste à la main.
//
// Page 2 : les deux tableaux, et le SCHÉMA DENTAIRE. L'arcade de RMA n'a pas
// les proportions de celle de l'ANAM : chaque dent — définitive et de lait —
// a donc été relevée une à une sur CE scan (voir ARCADE_RMA), et la dent
// traitée est entourée comme l'imprimé le demande.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { fichierPublic } from '@/lib/fichiers-publics'
import { estProtheseOuOdf } from '@/lib/nomenclature-anam'
import type {
  ActeImprime, BeneficiaireImprime, FeuilleImprimee, PraticienImprime,
} from '@/lib/feuilles-soins'
import type { Organisme } from '@/lib/organismes'
import type { Assure } from '@/lib/assure'

export interface Props {
  organisme: Organisme
  praticien: PraticienImprime
  patientId: string
  beneficiaire: BeneficiaireImprime
  feuille: FeuilleImprimee
  actes: ActeImprime[]
  /** L'assuré, d'après la fiche patient (lib/assure.ts). */
  assure?: Assure
}

const L = 1700
const H = 1236

const jour = (j?: string | null) => {
  const s = String(j ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}
const dh = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

/** Coupe un libellé qui ne tiendrait pas dans sa colonne : déborder serait
 *  pire, le texte passerait sous la colonne voisine. */
function tronque(texte: string, largeur: number, taille: number): string {
  const max = Math.floor(largeur / (taille * 0.5))
  return texte.length <= max ? texte : `${texte.slice(0, max - 1).trimEnd()}…`
}

/** Les lignes d'écriture, relevées sur les pointillés de chaque tableau. */
const SOINS = [453, 470, 487, 504, 521, 538, 554, 571, 588, 605, 622, 638, 655, 672]
const PROPOSITION = [133, 150, 166, 183, 200, 217]
const EXECUTION = [251, 268, 285, 302, 318, 336, 354]

// ── L'ARCADE DE LA PAGE 2 ───────────────────────────────────────────────────
//
// Le centre de chaque dent, relevé sur le scan en millièmes de largeur. Le
// côté gauche de l'écran (« D ») est la droite du patient.
const ARCADE_RMA: Record<string, [number, number]> = {
  // Définitives — haut
  '11': [752.4, 167.5], '12': [744.3, 170.4], '13': [737.1, 176.9], '14': [732.7, 185.5],
  '15': [726.3, 195.5], '16': [723.0, 207.6], '17': [719.4, 220.4], '18': [717.5, 234.7],
  '21': [763.5, 167.5], '22': [773.3, 170.4], '23': [779.2, 177.3], '24': [784.1, 185.5],
  '25': [789.0, 195.9], '26': [792.5, 207.6], '27': [795.9, 220.4], '28': [799.8, 235.1],
  // Définitives — bas
  '41': [752.7, 321.4], '42': [743.9, 319.4], '43': [738.0, 315.5], '44': [732.2, 307.6],
  '45': [727.3, 298.8], '46': [722.4, 288.0], '47': [719.0, 274.9], '48': [715.5, 259.6],
  '31': [763.5, 321.4], '32': [770.8, 319.4], '33': [776.3, 315.1], '34': [782.2, 308.2],
  '35': [787.5, 299.8], '36': [792.0, 289.0], '37': [795.9, 275.3], '38': [798.8, 259.6],
  // Lait — haut (anneau intérieur)
  '51': [755.2, 187.3], '52': [750.6, 190.5], '53': [745.4, 194.1], '54': [743.4, 198.6], '55': [740.0, 203.7],
  '61': [760.5, 187.3], '62': [765.5, 190.5], '63': [770.5, 194.1], '64': [773.0, 198.5], '65': [776.0, 203.5],
  // Lait — bas
  '81': [756.2, 303.2], '82': [751.2, 302.2], '83': [746.0, 299.8], '84': [742.0, 295.0], '85': [737.6, 288.6],
  '71': [760.8, 303.2], '72': [765.7, 302.2], '73': [770.0, 299.8], '74': [774.0, 295.0], '75': [777.5, 288.6],
}

/** Le diamètre du cercle : une incisive est étroite, une molaire large. */
function diametre(fdi: string): number {
  const n = Number(fdi)
  if (Math.floor(n / 10) >= 5) return 5.5
  return [0, 9, 9, 10, 11, 12, 14, 14, 15][n % 10] ?? 12
}

export default function GabaritRMA({ praticien, patientId, beneficiaire, feuille, actes, assure }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const devis = feuille.nature === 'entente_prealable'
  // Les deux tableaux de l'imprimé. Un acte sans code part avec les soins :
  // c'est là que l'assureur s'attend à trouver le gros des lignes.
  const soins = items.filter((a) => !estProtheseOuOdf(a.code))
  const protheses = items.filter((a) => estProtheseOuOdf(a.code))

  const adresse = (assure?.adresse ?? '').replace(/\s+/g, ' ').trim()
  const coupe = adresse.length > 70 ? adresse.lastIndexOf(' ', 70) : -1
  const lien = assure?.lien === 'Lui même' ? 'Lui-même' : assure?.lien ?? ''
  const total = Number(feuille.total ?? 0)

  const page1: MarqueFormulaire[] = [
    devis
      ? { x: 690, y: 195, signe: 'croix', largeur: 11 }
      : { x: 846, y: 195, signe: 'croix', largeur: 11 },
    // N° d'affiliation : seize cases de 16,9 millièmes.
    { x: 609.6, y: 229, texte: assure?.immatriculation, pas: 16.9, taille: 11 },
    { x: 590, y: 266, texte: tronque(assure?.souscripteur ?? '', 230, 11), taille: 11 },
    { x: 603, y: 301, texte: assure?.police, taille: 11 },
    // L'assuré.
    { x: 606, y: 403, texte: assure?.nom, taille: 11 },
    { x: 573, y: 421, texte: coupe > 0 ? adresse.slice(0, coupe) : adresse.slice(0, 80), taille: 10.5 },
    ...(coupe > 0 ? [{ x: 532, y: 439, texte: adresse.slice(coupe + 1, coupe + 81), taille: 10.5 }] : []),
    // Le malade : le patient.
    { x: 606, y: 497, texte: beneficiaire.nom, taille: 11 },
    { x: 929, y: 497, texte: lien, taille: 10 },
    // Le montant des frais engagés, avant « DHS ».
    ...(total > 0 ? [{ x: 848, y: 555, texte: dh(total), taille: 11, ancre: 'end' as const }] : []),
    // « Fait à … , le … ».
    { x: 560, y: 631, texte: praticien.ville, taille: 11 },
    { x: 748, y: 631, texte: jour(feuille.jour), taille: 11 },
  ]

  const page2: MarqueFormulaire[] = [
    // ── Soins dentaires ────────────────────────────────────────────────
    ...soins.slice(0, SOINS.length).flatMap((a, i): MarqueFormulaire[] => {
      const y = SOINS[i] - 3
      return [
        { x: 545, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 9, ancre: 'middle' },
        { x: 600, y, texte: a.tooth ?? '', taille: 11, ancre: 'middle' },
        // La colonne « Nature de l'intervention » commence à 647 : le libellé
        // démarrait à 628, dans la colonne des dents.
        { x: 648, y, texte: tronque(a.label, 62, 8.5), taille: 8.5 },
        { x: 740, y, texte: a.coefficient ? `${a.lettre_cle ?? ''} ${a.coefficient}`.trim() : '', taille: 11, ancre: 'middle' },
        { x: 830, y, texte: dh(a.amount), taille: 11, ancre: 'end' },
      ]
    }),

    // ── ODF & Prothèses dentaires ──────────────────────────────────────
    // Une déclaration de devis remplit « Proposition », une déclaration
    // d'exécution remplit « Exécution ». Jamais les deux.
    ...protheses.slice(0, (devis ? PROPOSITION : EXECUTION).length)
      .flatMap((a, i): MarqueFormulaire[] => {
        const y = (devis ? PROPOSITION : EXECUTION)[i] - 3
        const cotation = a.coefficient ? `${a.lettre_cle ?? ''} ${a.coefficient}`.trim() : ''
        return [
          // Les trois colonnes sont serrées : à pleine taille, la date mord
          // sur le libellé. On rétrécit plutôt que de laisser se chevaucher.
          { x: 102, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 9, ancre: 'middle' },
          // « Coefficient des travaux » : la cotation, et la dent. Le libellé
          // n'a pas de colonne dans ce tableau.
          { x: 170, y, texte: tronque([cotation, a.tooth ? `dent ${a.tooth}` : ''].filter(Boolean).join(' · ') || a.label, 68, 9.5), taille: 9.5, ancre: 'middle' },
          { x: 265, y, texte: dh(a.amount), taille: 10, ancre: 'end' },
        ]
      }),

    // Le schéma : « Le praticien est prié de préciser la dent traitée. »
    ...items.flatMap((a): MarqueFormulaire[] => {
      const t = String(a.tooth ?? '').trim()
      const c = ARCADE_RMA[t]
      return c ? [{ x: c[0], y: c[1], signe: 'cercle', largeur: diametre(t) }] : []
    }),
  ]

  const pages: PageFormulaire[] = [
    { image: fichierPublic('/formulaires/rma-1.jpg'), largeur: L, hauteur: H, marques: page1 },
    { image: fichierPublic('/formulaires/rma-2.jpg'), largeur: L, hauteur: H, marques: page2 },
  ]

  return <FormulaireImprime pages={pages} orientation="landscape" retourHref={`/patients/${patientId}`} />
}
