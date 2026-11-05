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
// ── CE QUE LE LOGICIEL N'ÉCRIT PAS ──────────────────────────────────────────
//
// Toute la page 1, sauf une case. Elle se termine par « Signature de
// l'assuré(e) » : affiliation, souscripteur, police, adresse, identité du
// malade, montant engagé, c'est SA déclaration, qu'il écrit de sa main. La
// seule case que le logiciel y coche est « Type de déclaration », Devis ou
// Exécution : elle ne dit rien de l'assuré, elle dit ce que le praticien a
// fait ou propose de faire, et lui seul peut la remplir.
//
// Et pas le SCHÉMA DENTAIRE. L'arcade de RMA n'est pas celle de l'ANAM : ses
// deux rangées ont d'autres proportions, et la caler depuis celle de la CNSS
// place les cercles sur la rangée intérieure — essayé, vérifié, écarté. Le
// numéro de la dent part dans la colonne « Dents traitées », qui est ce que
// l'assureur lit ; le praticien entoure la dent au stylo.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { fichierPublic } from '@/lib/fichiers-publics'
import { estProtheseOuOdf } from '@/lib/nomenclature-anam'
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
const SOINS = [453, 470, 487, 504, 521, 538, 554, 571, 588, 606, 622, 639, 656]
const PROPOSITION = [133, 151, 165, 183, 201, 218]
const EXECUTION = [251, 268, 286, 302, 318]

export default function GabaritRMA({ praticien, patientId, feuille, actes }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const devis = feuille.nature === 'entente_prealable'
  // Les deux tableaux de l'imprimé. Un acte sans code part avec les soins :
  // c'est là que l'assureur s'attend à trouver le gros des lignes.
  const soins = items.filter((a) => !estProtheseOuOdf(a.code))
  const protheses = items.filter((a) => estProtheseOuOdf(a.code))

  const page1: MarqueFormulaire[] = [
    devis
      ? { x: 690, y: 195, signe: 'croix', largeur: 11 }
      : { x: 846, y: 195, signe: 'croix', largeur: 11 },
  ]

  const page2: MarqueFormulaire[] = [
    // ── Soins dentaires ────────────────────────────────────────────────
    ...soins.slice(0, SOINS.length).flatMap((a, i): MarqueFormulaire[] => {
      const y = SOINS[i] - 3
      return [
        { x: 537, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 10, ancre: 'middle' },
        { x: 599, y, texte: a.tooth ?? '', taille: 11, ancre: 'middle' },
        { x: 628, y, texte: tronque(a.label, 88, 10), taille: 10 },
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
          { x: 170, y, texte: tronque(`${a.label}${a.tooth ? ` (${a.tooth})` : ''}${cotation ? ` — ${cotation}` : ''}`, 68, 9), taille: 9, ancre: 'middle' },
          { x: 265, y, texte: dh(a.amount), taille: 10, ancre: 'end' },
        ]
      }),
  ]

  const pages: PageFormulaire[] = [
    { image: fichierPublic('/formulaires/rma-1.jpg'), largeur: L, hauteur: H, marques: page1 },
    { image: fichierPublic('/formulaires/rma-2.jpg'), largeur: L, hauteur: H, marques: page2 },
  ]

  return <FormulaireImprime pages={pages} orientation="landscape" retourHref={`/patients/${patientId}`} />
}
