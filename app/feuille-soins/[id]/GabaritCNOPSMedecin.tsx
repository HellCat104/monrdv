// La « Feuille de soins Maladie » du CNOPS — Réf. ANAM 1.1.01.01.
//
// L'imprimé du MÉDECIN. GabaritCNOPS.tsx, lui, est la « Feuille de soins
// Dentaires » (Réf. ANAM 1.1.03.01) : même caisse, autre formulaire.
//
// ── CE QUI LE DISTINGUE DE L'IMPRIMÉ CNSS ───────────────────────────────────
//
//   · Son tableau d'actes a NEUF lignes réglées, et une colonne « Valeur Clé »
//     que la CNSS n'a pas.
//   · Sa date de naissance n'a que SIX cases — le siècle n'y rentre pas, on
//     écrit JJ MM AA.
//   · Son N° INP en a neuf, et non dix.
//   · Il ne pose pas la question « Entente préalable / Exécution » : la case
//     n'existe pas sur l'imprimé médecin. Ce que la feuille porte à ce titre
//     ne s'imprime donc nulle part ici.
//   · Ses cases à cocher sont des CERCLES, pas des carrés.
//
// ── CE QU'IL LAISSE VIERGE ──────────────────────────────────────────────────
//
//   · « Partie réservée à l'assuré(e) » : l'assuré la remplit et signe.
//   · « Type de soins » (Maladie, Maternité, Hospitalisation, Accident) et
//     tout le bloc des dates de grossesse, d'accouchement, d'hospitalisation
//     et d'accident : le logiciel ne sait pas lequel est vrai, et une case
//     cochée à tort fait rejeter le dossier.
//   · « Pli confidentiel remis » : c'est une remise en main propre, pas une
//     donnée du dossier.
//   · « CIM-10 », les tableaux biologie / radiologie, paramédicaux et
//     pharmacie : ils sont à d'autres praticiens.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { fichierPublic } from '@/lib/fichiers-publics'
import { cases, chiffres, chiffres6, cotation, dh, grille, jour } from './valeurs'
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

/** Les deux pages du scan n'ont pas tout à fait la même hauteur. */
const L = 1700
const H1 = 1309
const H2 = 1314

// ── Page 1 : les grilles, relevées sur le scan ──────────────────────────────
const NAISSANCE = [720.5, 733.1, 745.8, 758.4, 771.0, 783.7]
/** Les deux peignes réguliers, par leurs bords : huit cases pour le CIN,
 *  neuf pour le N° INP. Une valeur plus longue s'y resserre au lieu d'en
 *  sortir — voir `grille` dans valeurs.ts. */
const CIN = [702.4, 802.4]
const INP = [640.3, 753.8]
const FAIT_LE = [827.1, 839.6, 854.7, 867.1, 882.4, 895.0, 907.7, 920.0]

// ── Page 2 : le tableau « description des actes effectués » ─────────────────
//
// Neuf lignes réglées, relevées une à une : leurs hauteurs ne sont pas
// rigoureusement égales sur le scan.
const LIGNES = [120, 143, 165, 188, 211, 234, 256, 279, 301]
/** Le centre de chaque colonne. Le montant, lui, se cale à droite. */
const COL_DATE = 67.1
const COL_CODE = 135.9
const COL_COTATION = 194.1
const COL_VALEUR = 251.5
const COL_MONTANT_FIN = 334.5

export default function GabaritCNOPSMedecin({ praticien, patientId, beneficiaire, feuille, actes }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)

  const page1: MarqueFormulaire[] = [
    // Déclaration du médecin traitant — le bénéficiaire des soins.
    { x: 608, y: 380, texte: beneficiaire.nom, taille: 13 },
    ...cases(NAISSANCE, 394, chiffres6(beneficiaire.dateNaissance), 10),
    ...grille(CIN[0], CIN[1], 412, beneficiaire.cin, 10),
    ...(beneficiaire.sexe === 'M' ? [{ x: 712.6, y: 428.5, signe: 'croix' as const, largeur: 10 }] : []),
    ...(beneficiaire.sexe === 'F' ? [{ x: 790, y: 428.5, signe: 'croix' as const, largeur: 10 }] : []),

    // Identification du médecin traitant.
    ...grille(INP[0], INP[1], 468, praticien.inpe, 10),

    // Le cadre d'attestation de DROITE, celui du médecin. Celui de gauche est
    // à l'assuré et reste vierge.
    { x: 815, y: 641, texte: praticien.ville, taille: 12 },
    ...cases(FAIT_LE, 659, chiffres(feuille.jour), 10),
  ]

  const page2: MarqueFormulaire[] = items.slice(0, LIGNES.length).flatMap((a, i): MarqueFormulaire[] => {
    const y = LIGNES[i]
    return [
      { x: COL_DATE, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 10, ancre: 'middle' },
      { x: COL_CODE, y, texte: a.code ?? '', taille: 11, ancre: 'middle' },
      { x: COL_COTATION, y, texte: cotation(a.lettre_cle, a.coefficient), taille: 11, ancre: 'middle' },
      { x: COL_VALEUR, y, texte: a.valeur_cle != null ? String(a.valeur_cle) : '', taille: 11, ancre: 'middle' },
      { x: COL_MONTANT_FIN, y, texte: dh(a.amount), taille: 11, ancre: 'end' },
    ]
  })

  const pages: PageFormulaire[] = [
    { image: fichierPublic('/formulaires/cnops-med-1.jpg'), largeur: L, hauteur: H1, marques: page1 },
    { image: fichierPublic('/formulaires/cnops-med-2.jpg'), largeur: L, hauteur: H2, marques: page2 },
  ]

  return <FormulaireImprime pages={pages} orientation="landscape" retourHref={`/patients/${patientId}`} />
}
