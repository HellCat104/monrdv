// La « Feuille de Soins Maladie » de la CNSS — Réf. ANAM 1.2.01.01 / 610-1-02.
//
// L'imprimé du MÉDECIN, à ne pas confondre avec GabaritCNSS.tsx, qui est la
// « Feuille de soins dentaires » (Réf. ANAM 1.2.03.01) du chirurgien-dentiste.
// Ce sont deux formulaires différents de la même caisse : celui-ci n'a ni
// schéma de dents, ni colonne « Dent traitée », et son tableau d'actes porte
// la cotation NGAP du médecin.
//
// Le fond EST le formulaire officiel, scanné ; on ne pose dessus que ce que le
// praticien y écrirait. Voir components/shared/FormulaireImprime.tsx.
//
// ── CE QUE LE LOGICIEL ÉCRIT ────────────────────────────────────────────────
//
//   · « Déclaration du médecin traitant » — le bénéficiaire des soins.
//     L'imprimé veut que ce soit le praticien qui porte le nom du soigné.
//   · « INPE et code à barres », côté Médecin traitant.
//   · « Fait à / Le » du cadre de droite, celui du praticien.
//   · Le tableau « Description des actes effectués », premier bloc.
//
// ── CE QU'IL LAISSE VIERGE, ET POURQUOI ─────────────────────────────────────
//
//   · « Partie réservée à l'assuré(e) » : l'assuré l'écrit de sa main et signe
//     dessous. Le cabinet n'a pas à déclarer une identité qui n'est pas la
//     sienne à déclarer.
//   · « Type de soins » — Hospitalisation, Maternité, Accident, Maladie :
//     coché PAR LE PRATICIEN à l'écran, jamais deviné. Le logiciel ne peut
//     pas savoir si la consultation suit un accident du travail, et une case
//     cochée à tort fait rejeter le dossier. Rien n'est coché d'office ;
//     ce que le praticien coche, on l'imprime.
//   · « CIM-10 » : le logiciel ne tient pas de codage CIM des diagnostics.
//   · Le deuxième bloc d'actes, et les tableaux biologie / radiologie /
//     pharmacie : ils sont à d'AUTRES praticiens, qui y mettent leur propre
//     INPE et leur propre cachet.
import FormulaireImprime, { type MarqueFormulaire, type PageFormulaire } from '@/components/shared/FormulaireImprime'
import { fichierPublic } from '@/lib/fichiers-publics'
import { cases, chiffres, cotation, dh, grille, jour } from './valeurs'
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
const H = 1201

// ── Page 1 : les grilles de cases, relevées une fois sur le scan ────────────
//
// Les cases de date sont groupées « JJ | MM | AAAA », avec un blanc entre les
// groupes : un pas constant déraperait dès le troisième chiffre. On garde donc
// le centre de chacune.
const NAISSANCE = [764.5, 776.9, 798.5, 810.9, 832.5, 844.9, 857.5, 870.1]
const FAIT_LE = [832.1, 843.2, 862.2, 873.4, 892.7, 903.8, 915.0, 926.2]
/** Les peignes réguliers : leurs deux bords, relevés sur le scan. Le CIN en
 *  a huit cases, l'INPE du médecin neuf, et celui du bloc d'actes dix. */
const CIN = [640.5, 739.7]
const INPE_MEDECIN = [643.1, 746.4]
const INPE_ACTES = [112.9, 212.9]

// ── Page 2 : le tableau « Description des actes effectués » ─────────────────
//
// Le premier bloc n'est pas réglé : il n'a que ses colonnes, et le praticien
// écrit librement entre le haut (102) et le bas (157). On y pose cinq lignes
// régulières — de quoi tenir une consultation et ses actes, sachant que la
// feuille de soins d'un cabinet de ville en porte rarement plus de trois.
const LIGNES = [112.5, 123, 133.5, 144, 154.5]
/** Les quatre cases de la colonne « Code des actes ». */
const CASES_CODE = [177.4, 195.5, 213.6, 232.7]

/** La rangée « Type de soins », relevée sur le scan : quatre cases carrées
 *  alignées, dans l'ordre de l'imprimé. */
const TYPE_SOINS_Y = 483
const TYPE_SOINS_X: Record<string, number> = {
  hospitalisation: 630,
  maternite: 721.5,
  accident: 801,
  maladie: 896,
}

export default function GabaritCNSSMedecin({ praticien, patientId, beneficiaire, feuille, actes }: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)

  const page1: MarqueFormulaire[] = [
    // Entente préalable ou exécution, en tête de l'imprimé.
    feuille.nature === 'entente_prealable'
      ? { x: 723.4, y: 79, signe: 'croix', largeur: 12 }
      : { x: 827.6, y: 79, signe: 'croix', largeur: 12 },

    // Déclaration du médecin traitant — le bénéficiaire des soins.
    { x: 632, y: 331, texte: beneficiaire.nom, taille: 13 },
    ...cases(NAISSANCE, 348, chiffres(beneficiaire.dateNaissance)),
    ...grille(CIN[0], CIN[1], 364, beneficiaire.cin, 10),
    ...(beneficiaire.sexe === 'M' ? [{ x: 704, y: 385.5, signe: 'croix' as const, largeur: 9 }] : []),
    ...(beneficiaire.sexe === 'F' ? [{ x: 798, y: 385.5, signe: 'croix' as const, largeur: 9 }] : []),

    // INPE, dans le cadre « Médecin traitant » — pas celui de droite, qui est
    // à l'établissement de soins.
    ...grille(INPE_MEDECIN[0], INPE_MEDECIN[1], 415, praticien.inpe, 10),

    // « Type de soins ». Ce que le praticien a coché à l'écran, et rien de
    // plus : l'imprimé dit « Cocher la mention utile pour chaque case », il
    // en accepte donc plusieurs, et aucune si le praticien n'a rien dit.
    ...feuille.typesSoins
      .filter((t) => TYPE_SOINS_X[t] !== undefined)
      .map((t): MarqueFormulaire => ({ x: TYPE_SOINS_X[t], y: TYPE_SOINS_Y, signe: 'croix', largeur: 9 })),

    // Le cadre d'attestation de DROITE : « Je déclare les informations
    // ci-dessus sincères et véritables », signé du médecin. Celui de gauche
    // est à l'assuré, et reste vierge.
    { x: 795, y: 531, texte: praticien.ville, taille: 12 },
    ...cases(FAIT_LE, 541, chiffres(feuille.jour)),
  ]

  const page2: MarqueFormulaire[] = items.slice(0, LIGNES.length).flatMap((a, i): MarqueFormulaire[] => {
    const y = LIGNES[i]
    const code = String(a.code ?? '').trim()
    return [
      { x: 138.3, y, texte: jour(a.acte_date) || jour(feuille.jour), taille: 10, ancre: 'middle' },
      // Le code tient dans ses quatre cases quand il en a la taille ; au-delà,
      // il s'écrit d'un bloc au travers de la colonne plutôt que d'être coupé.
      ...(code.length <= CASES_CODE.length
        ? cases(CASES_CODE, y, code, 11)
        : [{ x: 205.5, y, texte: code, taille: 9, ancre: 'middle' as const }]),
      { x: 276, y, texte: cotation(a.lettre_cle, a.coefficient), taille: 11, ancre: 'middle' },
      { x: 370, y, texte: dh(a.amount), taille: 11, ancre: 'end' },
    ]
  }).concat(
    // L'INPE du premier bloc : c'est lui qui dit QUI a fait ces actes.
    items.length > 0
      ? grille(INPE_ACTES[0], INPE_ACTES[1], 172, praticien.inpe, 9)
      : [],
  )

  const pages: PageFormulaire[] = [
    { image: fichierPublic('/formulaires/cnss-med-1.jpg'), largeur: L, hauteur: H, marques: page1 },
    { image: fichierPublic('/formulaires/cnss-med-2.jpg'), largeur: L, hauteur: H, marques: page2 },
  ]

  return <FormulaireImprime pages={pages} orientation="landscape" retourHref={`/patients/${patientId}`} />
}
