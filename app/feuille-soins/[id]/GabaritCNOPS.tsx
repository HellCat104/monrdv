// La « Feuille de soins Dentaires » du CNOPS — Réf. ANAM 1.1.03.01.
//
// Le formulaire officiel lui-même, scanné, rempli par-dessus : voir
// components/shared/FormulaireImprime.tsx. Ce fichier ne contient pas de mise
// en page, seulement OÙ chaque valeur se pose, en millièmes de la largeur de
// la page.
//
// ── CE QU'IL ÉCRIT, ET CE QU'IL LAISSE ──────────────────────────────────────
//
// Il remplit la DÉCLARATION du médecin traitant — l'imprimé veut que le nom du
// soigné soit porté par le praticien lui-même —, son IDENTIFICATION, le
// tableau des actes, le schéma dentaire, et son cadre de signature. Il ne
// touche pas à « Partie réservée à l'assuré(e) » : l'assuré l'écrit de sa main
// et signe dessous.
//
// ── UNE DIFFÉRENCE AVEC LA CNSS, ET ELLE VIENT DU SCAN ──────────────────────
//
// Le CNOPS imprime ses cases à cocher en traits très pâles, et le nettoyage
// qui blanchit le fond du scan les a effacées. Les croix sont donc posées
// JUSTE APRÈS le libellé français, pas dans un cercle — c'est sans ambiguïté
// pour l'agent qui lit, mais ce n'est pas tout à fait la trame d'origine.
// Avec le PDF du CNOPS en main, on remet le scan d'aplomb et les croix
// retrouvent leurs cercles.
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
const H = 1314

const jour = (j?: string | null) => {
  const s = String(j ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}
const dh = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

// ── Le schéma dentaire de la page 2 ─────────────────────────────────────────
//
// C'est LE MÊME DESSIN que celui de la CNSS — l'arcade normalisée de l'ANAM —
// agrandi d'un peu plus de huit pour cent. Ses contours sont trop pâles sur ce
// scan pour qu'on les détecte un à un comme on l'a fait sur celui de la CNSS ;
// on reprend donc les centres relevés là-bas et on les met à l'échelle du
// CNOPS, par ses axes H–B et D–G. Le résultat a été vérifié dent par dent,
// cercles tracés sur le scan.
const ARCADE: Record<number, [number, number][]> = {
  1: [[752.8, 405.3], [743.1, 409.0], [735.8, 415.6], [731.6, 426.6],
      [724.3, 438.3], [720.8, 453.4], [717.0, 468.7], [714.3, 485.8]],
  2: [[763.9, 405.0], [774.0, 408.6], [781.1, 415.8], [785.0, 426.8],
      [792.2, 439.6], [794.8, 453.6], [799.2, 469.2], [802.2, 486.9]],
  3: [[762.5, 592.6], [770.8, 589.4], [778.8, 584.5], [784.2, 575.0],
      [789.0, 563.7], [794.3, 551.5], [797.8, 535.2], [801.8, 516.7]],
  4: [[753.3, 592.5], [744.0, 589.7], [735.5, 585.2], [729.8, 576.1],
      [725.3, 564.5], [720.1, 552.0], [716.8, 535.7], [713.3, 517.3]],
}
/** Diamètre du cercle : les incisives sont étroites, les molaires larges. */
const DIAMETRE = [10, 12, 13, 14, 16, 17, 18, 20]

/** Le centre d'une dent sur l'arcade.
 *
 *  Rien pour les dents de LAIT : l'imprimé les dessine à l'intérieur de
 *  l'arcade, minuscules, et on ne sait pas les situer assez sûrement pour
 *  marquer un document de remboursement. Leur numéro figure dans la colonne
 *  « Dents traitées », qui est ce que l'organisme lit. */
function dentSurArcade(fdi: string | null | undefined): { x: number; y: number; d: number } | null {
  const m = /^([1-4])([1-8])$/.exec(String(fdi ?? '').trim())
  if (!m) return null
  const [x, y] = ARCADE[Number(m[1])][Number(m[2]) - 1]
  return { x, y, d: DIAMETRE[Number(m[2]) - 1] }
}

/** Les quatre lignes « Type de soins », et la hauteur de chacune. */
const TYPES: [string, number][] = [
  ['soins', 506], ['prothese', 520], ['orthodontie', 534], ['autres', 547],
]

export default function GabaritCNOPS({ praticien, patientId, beneficiaire, feuille, actes }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)

  const page1: MarqueFormulaire[] = [
    // Entente préalable ou exécution, en tête de l'imprimé. Ces deux cases-là
    // sont encadrées sur le scan : la croix tombe bien dedans.
    feuille.nature === 'entente_prealable'
      ? { x: 712, y: 132, signe: 'croix', largeur: 13 }
      : { x: 803, y: 132, signe: 'croix', largeur: 13 },

    // Déclaration du médecin traitant.
    { x: 605, y: 389, texte: beneficiaire.nom, taille: 13 },
    { x: 613, y: 408, texte: jour(beneficiaire.dateNaissance), taille: 13 },
    { x: 558, y: 424, texte: beneficiaire.cin, taille: 13 },
    ...(beneficiaire.sexe === 'M' ? [{ x: 695, y: 437, signe: 'croix' as const, largeur: 11 }] : []),
    ...(beneficiaire.sexe === 'F' ? [{ x: 764, y: 437, signe: 'croix' as const, largeur: 11 }] : []),

    // Identification du chirurgien dentiste.
    { x: 553, y: 476, texte: praticien.inpe, taille: 13 },
    ...TYPES.filter(([cle]) => feuille.typesSoins.includes(cle))
      .map(([, y]): MarqueFormulaire => ({ x: 580, y, signe: 'croix', largeur: 12 })),
    { x: 625, y: 561, texte: feuille.ententeNo, taille: 13 },

    // Le cadre de signature du praticien — celui de droite. Celui de gauche
    // est à l'assuré, et reste vierge.
    { x: 805, y: 642, texte: praticien.ville, taille: 12 },
    { x: 792, y: 659, texte: jour(feuille.jour), taille: 12 },
  ]

  // Huit lignes, relevées sur les filets du tableau.
  const LIGNES = [142, 162, 182, 203, 223, 244, 264, 284]
  const page2: MarqueFormulaire[] = [
    ...items.slice(0, LIGNES.length).flatMap((a, i): MarqueFormulaire[] => {
      const y = LIGNES[i]
      return [
        { x: 550.8, y, texte: a.tooth ?? '', taille: 12, ancre: 'middle' },
        { x: 614.6, y, texte: a.code ?? '', taille: 12, ancre: 'middle' },
        { x: 675.9, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 10, ancre: 'middle' },
        { x: 734.6, y, texte: a.coefficient ? `${a.lettre_cle ?? ''} ${a.coefficient}`.trim() : '', taille: 12, ancre: 'middle' },
        { x: 793.0, y, texte: a.valeur_cle != null ? String(a.valeur_cle) : '', taille: 12, ancre: 'middle' },
        { x: 878, y, texte: dh(a.amount), taille: 12, ancre: 'end' },
      ]
    }),
    // « Le praticien est prié de préciser la dent traitée. »
    ...items.flatMap((a): MarqueFormulaire[] => {
      const d = dentSurArcade(a.tooth)
      return d ? [{ x: d.x, y: d.y, signe: 'cercle', largeur: d.d }] : []
    }),
  ]

  const pages: PageFormulaire[] = [
    { image: fichierPublic('/formulaires/cnops-1.jpg'), largeur: L, hauteur: H, marques: page1 },
    { image: fichierPublic('/formulaires/cnops-2.jpg'), largeur: L, hauteur: H, marques: page2 },
  ]

  return <FormulaireImprime pages={pages} orientation="landscape" retourHref={`/patients/${patientId}`} />
}
