// La « Déclaration de maladie » de RMA Watanya — FOR.GM-021, code GP 002,
// version 2020.
//
// L'imprimé du MÉDECIN. GabaritRMA.tsx, lui, est la « Déclaration dentaire »
// (FOR-GM-022) : même assureur, autre formulaire.
//
// ── UN IMPRIMÉ EN DEUX MOITIÉS ──────────────────────────────────────────────
//
// La page 1 est tout entière à l'assuré et au souscripteur : type de
// déclaration, n° d'affiliation, n° de police, renseignements sur l'assuré et
// sur le malade, montant des frais, signature. Le cabinet n'y touche pas — et
// elle s'imprime quand même, parce qu'une déclaration remise sans sa première
// page n'est pas une déclaration.
//
// La page 2 porte « Partie réservée au praticien traitant » et le tableau
// « Nature des prestations ». C'est la nôtre.
//
// Le scan de cette page 2 arrive à l'envers dans le PDF d'origine : il a été
// redressé avant d'entrer dans public/formulaires.
//
// ── CE QUE LE LOGICIEL ÉCRIT ────────────────────────────────────────────────
//
//   · Nom et prénom du malade, et sa date de naissance.
//   · Les actes, dans le groupe « Médecin traitant » du tableau.
//
// ── CE QU'IL LAISSE VIERGE, ET POURQUOI ─────────────────────────────────────
//
//   · « Nature de la maladie » : une feuille de soins MonRDV porte des ACTES,
//     pas un diagnostic. Recopier le libellé d'un acte à la place de la
//     maladie dirait autre chose que ce que le praticien a écrit.
//   · « En cas d'accident (préciser causes et circonstances) » : même raison.
//   · « Ordonnance » : le logiciel ne relie pas encore une ordonnance à une
//     ligne de feuille de soins.
//   · Les groupes « Auxiliaires médicaux » et « Analyses et radiographies »,
//     et le cadre « Pharmacie » : ils sont à d'autres praticiens, qui y
//     apposent leur propre cachet.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { fichierPublic } from '@/lib/fichiers-publics'
import { cotation, dh, jour } from './valeurs'
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

/** Les six lignes pointillées du groupe « Médecin traitant ». Les deux autres
 *  groupes du tableau ne sont pas à nous. */
const LIGNES = [332, 349.5, 365, 382, 400, 417]
const COL_DATE = 113.4
const COL_ACTE = 172.9
const COL_HONORAIRES_FIN = 331

export default function GabaritRMAMedecin({ patientId, beneficiaire, feuille, actes }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)

  const page2: MarqueFormulaire[] = [
    { x: 150, y: 86, texte: beneficiaire.nom, taille: 12 },
    { x: 288, y: 106, texte: jour(beneficiaire.dateNaissance), taille: 12 },

    ...items.slice(0, LIGNES.length).flatMap((a, i): MarqueFormulaire[] => {
      const y = LIGNES[i]
      return [
        { x: COL_DATE, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 10, ancre: 'middle' },
        // L'imprimé demande « Acte et coefficient » dans une seule colonne :
        // le code de l'acte quand il y en a un, puis la cotation.
        {
          x: COL_ACTE, y, taille: 10, ancre: 'middle',
          texte: [a.code, cotation(a.lettre_cle, a.coefficient)].filter(Boolean).join(' ') || null,
        },
        { x: COL_HONORAIRES_FIN, y, texte: dh(a.amount), taille: 10, ancre: 'end' },
      ]
    }),
  ]

  const pages: PageFormulaire[] = [
    // Page 1 : celle de l'assuré. Aucune marque, et elle sort quand même.
    { image: fichierPublic('/formulaires/rma-med-1.jpg'), largeur: L, hauteur: H, marques: [] },
    { image: fichierPublic('/formulaires/rma-med-2.jpg'), largeur: L, hauteur: H, marques: page2 },
  ]

  return <FormulaireImprime pages={pages} orientation="landscape" retourHref={`/patients/${patientId}`} />
}
