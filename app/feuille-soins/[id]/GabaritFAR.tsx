// La « Feuille de maladie » de la Mutuelle des Forces Armées Royales.
//
// Le formulaire officiel lui-même, scanné, rempli par-dessus — voir
// components/shared/FormulaireImprime.tsx pour le pourquoi. Ce fichier ne
// contient donc plus de mise en page : seulement OÙ chaque valeur se pose, en
// millièmes de la largeur de la page, relevés une fois sur le scan.
//
// ── UN CARNET DE QUATRE PAGES ───────────────────────────────────────────────
//
//   page 1 — l'adhérent, le bénéficiaire, et le N° INPE du praticien
//   page 2 — l'ORDONNANCE, au pharmacien
//   page 3 — le relevé commun à tout le corps de santé
//   page 4 — « SOINS ET PROTHESE DENTAIRE (INPE) », la page du dentiste
//
// ── REMPLI AU MAXIMUM (novembre 2026) ──────────────────────────────────────
//
// À la demande des cabinets, le carnet sort rempli de tout ce que MonRDV sait :
// l'adhérent (fiche patient, bloc « Assuré » : CIN, téléphone, nom, grade,
// unité, adresse), le bénéficiaire (nom, date de naissance, lien), la case
// « Maladie », l'INPE, les frais engagés et la date. Restent à la main : le
// numéro de compte bancaire et les signatures.
//
// ⚠ L'imprimé porte : « L'identité du malade doit être portée de la main du
// médecin traitant. » La version précédente laissait donc ces lignes vierges.
// Elles sont désormais imprimées, à la demande du cabinet ; si la Mutuelle
// refusait une identité imprimée, c'est la marque `beneficiaireImprime` qu'on
// retire, et elle seule.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { dentCroisee, estProtheseOuOdf } from '@/lib/nomenclature-anam'
import type {
  ActeImprime, BeneficiaireImprime, FeuilleImprimee, PraticienImprime,
} from '@/lib/feuilles-soins'
import type { Organisme } from '@/lib/organismes'
import type { Assure } from '@/lib/assure'
import { fichierPublic } from '@/lib/fichiers-publics'

export interface Props {
  organisme: Organisme
  praticien: PraticienImprime
  patientId: string
  beneficiaire: BeneficiaireImprime
  feuille: FeuilleImprimee
  actes: ActeImprime[]
  /** Sortir la page 4, « SOINS ET PROTHESE DENTAIRE ».
   *
   *  Le carnet est commun à tout le corps de santé : sa page 3 est le relevé
   *  général, et sa page 4 celle du dentiste. Un généraliste qui la remet à
   *  son patient lui donne une page de dents vide à faire signer. */
  avecPageDentiste?: boolean
  /** L'adhérent, d'après la fiche patient (lib/assure.ts). */
  assure?: Assure
}

/** Les quatre scans, tous au même format. */
const L = 1314
const H = 1700

const jour = (j?: string | null) => {
  const s = String(j ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}
const dh = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

/** Coupe un libellé qui ne tiendrait pas dans sa colonne. Une largeur est
 *  donnée en millièmes de page ; on compte un demi-corps par caractère, ce
 *  qui est la moyenne de l'Helvetica. Déborder serait pire que couper : le
 *  texte passerait sous la colonne voisine, déjà occupée. */
function tronque(texte: string, largeur: number, taille: number): string {
  const max = Math.floor(largeur / (taille * 0.5))
  return texte.length <= max ? texte : `${texte.slice(0, max - 1).trimEnd()}…`
}

// ── La grille des dents de la page 4 ────────────────────────────────────────
//
// Quatre rangées, seize colonnes, relevées case par case sur le scan. Les
// quadrants 1, 4, 5 et 8 — la droite du patient — se lisent de la ligne
// médiane vers le fond, donc de droite à gauche sur le dessin.
/** Les lignes d'écriture (pointillés), relevées sur le scan. */
const LIGNES_P3 = [281, 310, 340, 369]
const LIGNES_P4 = [251, 284, 316, 349, 379, 410]

const X_DROITE_DU_PATIENT = [483, 445, 407, 370, 332, 294, 256, 218]
const X_GAUCHE_DU_PATIENT = [538, 576, 612, 651, 689, 726, 763, 802]
const Y_QUADRANT: Record<number, number> = { 5: 613, 6: 613, 1: 641, 2: 641, 3: 668, 4: 668, 7: 694, 8: 694 }

/** Le centre d'une dent sur la grille, ou null si ce n'est pas un numéro FDI :
 *  une case « dent » laissée libre ne doit rien marquer. */
function caseDent(fdi: string | null | undefined): { x: number; y: number } | null {
  const m = /^([1-8])([1-8])$/.exec(String(fdi ?? '').trim())
  if (!m) return null
  const q = Number(m[1])
  const rang = Number(m[2])
  if (q >= 5 && rang > 5) return null
  const x = [1, 4, 5, 8].includes(q) ? X_DROITE_DU_PATIENT[rang - 1] : X_GAUCHE_DU_PATIENT[rang - 1]
  return { x, y: Y_QUADRANT[q] }
}

export default function GabaritFAR({ praticien, patientId, beneficiaire, feuille, actes, assure, avecPageDentiste = true }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const devis = feuille.nature === 'entente_prealable'

  // Les cases « Soins ? » et « Prothèse ? ». Le praticien les a cochées à
  // l'écran ; à défaut, la nomenclature des actes répond pour lui.
  const coche = (t: string) => feuille.typesSoins.includes(t)
  const unTypeChoisi = coche('soins') || coche('prothese')
  const soins = unTypeChoisi ? coche('soins') : items.some((a) => !estProtheseOuOdf(a.code))
  const prothese = unTypeChoisi ? coche('prothese') : items.some((a) => estProtheseOuOdf(a.code))

  // ── Page 1 : l'adhérent, le bénéficiaire, le médecin traitant ────────────
  const naissance = String(beneficiaire.dateNaissance ?? '').slice(0, 10)
  const [na, nm, nj] = /^\d{4}-\d{2}-\d{2}$/.test(naissance) ? naissance.split('-') : ['', '', '']
  // « Lui même » de MonRDV est l'« Adhérent » de la Mutuelle.
  const LIEN_X: Record<string, number> = { 'Lui même': 357, 'Conjoint': 548, 'Enfant': 723 }
  const lienX = assure?.lien ? LIEN_X[assure.lien] : undefined
  const total = Number(feuille.total ?? 0)
  const entiers = Math.floor(total)
  const centimes = Math.round((total - entiers) * 100)

  const adherent: MarqueFormulaire[] = assure ? [
    { x: 405, y: 392, texte: assure.cin, taille: 15 },
    { x: 300, y: 472, texte: assure.telephone, taille: 15 },
    { x: 280, y: 530, texte: assure.nom, taille: 15 },
    { x: 192, y: 563, texte: assure.grade, taille: 15 },
    { x: 190, y: 596, texte: assure.unite, taille: 15 },
    { x: 205, y: 629, texte: tronque(assure.adresse ?? '', 480, 13), taille: 13 },
  ] : []
  const beneficiaireImprime: MarqueFormulaire[] = [
    { x: 280, y: 717, texte: beneficiaire.nom, taille: 15 },
    { x: 366, y: 752, texte: nj, taille: 14, ancre: 'middle' },
    { x: 452, y: 752, texte: nm, taille: 14, ancre: 'middle' },
    { x: 572, y: 752, texte: na, taille: 14, ancre: 'middle' },
  ]
  const page1: MarqueFormulaire[] = [
    ...adherent,
    ...beneficiaireImprime,
    ...(lienX ? [{ x: lienX, y: 793, signe: 'croix' as const, largeur: 16 }] : []),
    // Une feuille de soins dentaires relève de la maladie.
    { x: 256, y: 843, signe: 'croix', largeur: 13 },
    { x: 335, y: 928, texte: praticien.inpe, taille: 15 },
    // « Frais engagés ....../...... Dh » : les dirhams, puis les centimes.
    ...(total > 0 ? [
      { x: 182, y: 1040, texte: entiers.toLocaleString('fr-FR'), taille: 13, ancre: 'end' as const },
      { x: 213, y: 1040, texte: String(centimes).padStart(2, '0'), taille: 13, ancre: 'middle' as const },
    ] : []),
    { x: 215, y: 1079, texte: jour(feuille.jour), taille: 14 },
  ]

  // ── Page 3 : le bloc « MÉDECIN TRAITANT OU CHIRURGIEN DENTISTE » ─────────
  //
  // Une seule colonne pour la nature de l'acte ET son coefficient : la dent y
  // entre aussi, puisque l'imprimé ne lui donne pas de colonne.
  const page3: MarqueFormulaire[] = [
    // L'INPE va dans la colonne qui le réclame : « Signature & Cachet du
    // praticien avec INPE ». Sous « - INPE - », à gauche, il tomberait sur le
    // libellé imprimé.
    { x: 772, y: 281, texte: praticien.inpe, taille: 11, ancre: 'middle' },
    // Quatre lignes pointillées dans le bloc du praticien, relevées sur le
    // scan : l'ancien pas régulier (23) en posait cinq, et la troisième
    // tombait déjà entre deux lignes.
    ...items.slice(0, LIGNES_P3.length).flatMap((a, i): MarqueFormulaire[] => {
      const y = LIGNES_P3[i]
      const cotation = a.coefficient ? ` — ${`${a.lettre_cle ?? ''} ${a.coefficient}`.trim()}` : ''
      return [
        { x: 303, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 11, ancre: 'middle' },
        { x: 361, y, texte: tronque(`${a.tooth ? `Dent ${a.tooth} — ` : ''}${a.label}${cotation}`, 210, 11), taille: 11 },
        { x: 690, y, texte: dh(a.amount), taille: 11, ancre: 'end' },
      ]
    }),
  ]

  // ── Page 4 : la page du dentiste ─────────────────────────────────────────
  const page4: MarqueFormulaire[] = [
    // « Rayer la mention inutile » : le logiciel raye, le praticien n'a plus
    // à le faire. On barre celle qui ne s'applique pas.
    // « DEVIS ? » occupe 323–390, « REÇUS ? » 396–460 (relevé sur le scan).
    devis
      ? { x: 395, y: 146, signe: 'rature', largeur: 66 }
      : { x: 322, y: 146, signe: 'rature', largeur: 69 },

    // Six lignes, sur les pointillés du tableau.
    ...items.slice(0, LIGNES_P4.length).flatMap((a, i): MarqueFormulaire[] => {
      const y = LIGNES_P4[i]
      return [
        { x: 216, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 13, ancre: 'middle' },
        { x: 331, y, texte: a.tooth ?? '', taille: 13, ancre: 'middle' },
        { x: 385, y, texte: tronque(a.label, 268, 13), taille: 13 },
        { x: 691, y, texte: a.coefficient ? `${a.lettre_cle ?? ''} ${a.coefficient}`.trim() : '', taille: 13, ancre: 'middle' },
        { x: 865, y, texte: dh(a.amount), taille: 13, ancre: 'end' },
      ]
    }),

    ...(soins ? [{ x: 447, y: 466, signe: 'croix' as const, largeur: 20 }] : []),
    ...(prothese ? [{ x: 657, y: 466, signe: 'croix' as const, largeur: 20 }] : []),

    // « Le praticien met une croix sur la dent objet de la prothèse ou de
    // l'extraction. Il encercle la dent soignée ou couronnée. » — deux gestes
    // distincts, donc deux marques, et c'est l'imprimé qui les distingue.
    ...items.flatMap((a): MarqueFormulaire[] => {
      const c = caseDent(a.tooth)
      if (!c) return []
      return dentCroisee(a.code)
        ? [{ ...c, signe: 'croix', largeur: 19 }]
        : [{ ...c, signe: 'cercle', largeur: 27 }]
    }),
  ]

  const pages: PageFormulaire[] = [
    { image: fichierPublic('/formulaires/far-1.jpg'), largeur: L, hauteur: H, marques: page1 },
    { image: fichierPublic('/formulaires/far-2.jpg'), largeur: L, hauteur: H, marques: [] },
    { image: fichierPublic('/formulaires/far-3.jpg'), largeur: L, hauteur: H, marques: page3 },
    // La page du dentiste, et elle seule, s'efface pour les autres.
    ...(avecPageDentiste
      ? [{ image: fichierPublic('/formulaires/far-4.jpg'), largeur: L, hauteur: H, marques: page4 }]
      : []),
  ]

  return <FormulaireImprime pages={pages} orientation="portrait" retourHref={`/patients/${patientId}`} />
}
