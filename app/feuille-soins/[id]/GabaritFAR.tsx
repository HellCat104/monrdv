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
// ── CE QUE LE LOGICIEL N'ÉCRIT PAS ──────────────────────────────────────────
//
// Toute la partie de l'adhérent : il l'écrit de sa main et signe dessous. Et
// l'identité du MALADE non plus, ce qui n'est pas un oubli — l'imprimé
// l'interdit en toutes lettres : « L'identité du malade doit être portée de la
// main du médecin traitant. » Une identité imprimée n'est portée de la main de
// personne.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { dentCroisee, estProtheseOuOdf } from '@/lib/nomenclature-anam'
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

export default function GabaritFAR({ praticien, patientId, feuille, actes }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const devis = feuille.nature === 'entente_prealable'

  // Les cases « Soins ? » et « Prothèse ? ». Le praticien les a cochées à
  // l'écran ; à défaut, la nomenclature des actes répond pour lui.
  const coche = (t: string) => feuille.typesSoins.includes(t)
  const unTypeChoisi = coche('soins') || coche('prothese')
  const soins = unTypeChoisi ? coche('soins') : items.some((a) => !estProtheseOuOdf(a.code))
  const prothese = unTypeChoisi ? coche('prothese') : items.some((a) => estProtheseOuOdf(a.code))

  // ── Page 1 : rien que l'identification du médecin traitant ───────────────
  const page1: MarqueFormulaire[] = [
    { x: 335, y: 928, texte: praticien.inpe, taille: 15 },
  ]

  // ── Page 3 : le bloc « MÉDECIN TRAITANT OU CHIRURGIEN DENTISTE » ─────────
  //
  // Une seule colonne pour la nature de l'acte ET son coefficient : la dent y
  // entre aussi, puisque l'imprimé ne lui donne pas de colonne.
  const page3: MarqueFormulaire[] = [
    // L'INPE va dans la colonne qui le réclame : « Signature & Cachet du
    // praticien avec INPE ». Sous « - INPE - », à gauche, il tomberait sur le
    // libellé imprimé.
    { x: 776, y: 275, texte: praticien.inpe, taille: 11, ancre: 'middle' },
    ...items.slice(0, 5).flatMap((a, i): MarqueFormulaire[] => {
      const y = 268 + i * 23
      const cotation = a.coefficient ? ` — ${`${a.lettre_cle ?? ''} ${a.coefficient}`.trim()}` : ''
      return [
        { x: 299, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 12, ancre: 'middle' },
        { x: 356, y, texte: tronque(`${a.tooth ? `Dent ${a.tooth} — ` : ''}${a.label}${cotation}`, 214, 12), taille: 12 },
        { x: 684, y, texte: dh(a.amount), taille: 12, ancre: 'end' },
      ]
    }),
  ]

  // ── Page 4 : la page du dentiste ─────────────────────────────────────────
  const page4: MarqueFormulaire[] = [
    // « Rayer la mention inutile » : le logiciel raye, le praticien n'a plus
    // à le faire. On barre celle qui ne s'applique pas.
    devis
      ? { x: 420, y: 144, signe: 'rature', largeur: 82 }
      : { x: 336, y: 144, signe: 'rature', largeur: 71 },

    ...items.slice(0, 7).flatMap((a, i): MarqueFormulaire[] => {
      const y = 246 + i * 28
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
    { image: '/formulaires/far-1.jpg', largeur: L, hauteur: H, marques: page1 },
    { image: '/formulaires/far-2.jpg', largeur: L, hauteur: H, marques: [] },
    { image: '/formulaires/far-3.jpg', largeur: L, hauteur: H, marques: page3 },
    { image: '/formulaires/far-4.jpg', largeur: L, hauteur: H, marques: page4 },
  ]

  return <FormulaireImprime pages={pages} orientation="portrait" retourHref={`/patients/${patientId}`} />
}
