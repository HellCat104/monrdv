// Organismes de couverture — ce que CHACUN demande, lu sur son formulaire.
//
// ── CE QUI A CHANGÉ, ET POURQUOI ────────────────────────────────────────────
//
// La première version de ce fichier déclarait des champs « couramment
// demandés », avec cet avertissement : « ils doivent être relus sur les vraies
// feuilles de chaque organisme avant d'être présentés comme définitifs ».
// C'est fait. Tout ce qui suit est relevé sur les formulaires eux-mêmes :
//
//   · CNSS   — « Feuille de soins dentaires », Réf. ANAM 1.2.03.01 / 610-1-04
//   · CNOPS  — « Feuille de soins Dentaires », Réf. ANAM 1.1.03.01
//   · FAR    — Mutuelle des Forces Armées Royales, « Feuille de maladie »
//   · RMA    — RMA Watanya, « Déclaration dentaire », FOR-GM-022 version 2019
//
// Les deux premiers sont le MÊME formulaire normalisé par l'ANAM, à quelques
// mots près ; les deux autres sont propres à leur organisme. D'où les
// gabarits : « anam » couvre la CNSS et le CNOPS, « rma » et « far » sont
// seuls de leur espèce, et « neutre » est la feuille MonRDV d'avant — celle
// qu'on imprime quand on n'a pas le formulaire de l'organisme.
//
// ── CE QUE LE LOGICIEL N'INVENTE PAS ────────────────────────────────────────
//
// Ni les codes de la nomenclature, ni la valeur de la clé. Le praticien les
// écrit une fois, le logiciel les retient et les repropose. Un tarif inventé
// par le logiciel ferait rejeter un dossier sans que personne comprenne
// pourquoi.

/** La clé technique d'un organisme : elle commande le gabarit imprimé et les
 *  règles de délai. Elle est stockée sur la feuille établie (v95) pour que le
 *  document réimprimé dans trois ans reste celui qu'on a remis. */
export type CleOrganisme = 'cnss' | 'cnops' | 'far' | 'rma' | 'prive' | 'autre'

/** Le gabarit imprimé. « neutre » = la feuille MonRDV, à agrafer au
 *  formulaire de l'organisme : le repli quand on n'a pas son imprimé. */
export type Gabarit = 'anam' | 'rma' | 'far' | 'neutre'

export interface ChampOrganisme {
  cle: string
  label: string
  /** Aide affichée sous le champ, quand le mot du formulaire n'est pas évident. */
  aide?: string
  /** Le formulaire présente ce champ en cases à un chiffre : on imprime alors
   *  la valeur chiffre par chiffre, dans la grille. */
  cases?: number
}

export type TypeSoin = 'soins' | 'prothese' | 'orthodontie' | 'autres'

/** Le délai de dépôt, dans les mots de l'organisme.
 *
 *  `depuis` compte ce que le formulaire dit de compter, et les deux ne sont
 *  pas interchangeables : la CNSS part du PREMIER acte porté sur la feuille,
 *  RMA de la CESSATION des soins. Sur une feuille qui couvre six semaines de
 *  traitement, cela fait six semaines d'écart sur la date limite. */
export interface DelaiDepot {
  mois: number
  depuis: 'premier_acte' | 'dernier_acte'
  /** La phrase du formulaire, reproduite pour que l'écran puisse la citer
   *  plutôt que de paraphraser une règle qui engage le remboursement. */
  texte: string
}

export interface Organisme {
  cle: CleOrganisme
  /** Valeur stockée dans `patients.mutuelle`. */
  nom: string
  /** Autres écritures reconnues sur une fiche patient déjà remplie. */
  alias?: string[]
  /** Intitulé imprimé en tête du bloc « Assuré ». */
  intitule: string
  gabarit: Gabarit
  /** Les champs demandés par le formulaire, dans son ordre. */
  champs: ChampOrganisme[]
  /** Les cases « lien de parenté » du formulaire. Vide = champ libre. */
  liens: string[]
  /** Les cases « Type de soins ». null = le formulaire n'en a pas. */
  typesSoins: { cle: TypeSoin; label: string }[] | null
  /** Le formulaire a une colonne « Code des actes ». */
  colonneCode: boolean
  /** Le formulaire a une colonne « Lettre clé + Cotation » et « Valeur clé ». */
  colonneCotation: boolean
  /** Le formulaire porte un schéma dentaire à marquer. */
  schemaDentaire: boolean
  /** Le formulaire porte la case « Entente préalable / Devis ». */
  ententePrealable: boolean
  delai: DelaiDepot
  /** Ce qui, chez cet organisme, exige un accord AVANT d'être posé. Les mots
   *  sont ceux du formulaire : on les cite, on ne les reformule pas. */
  accordPrealable: string[]
}

// ── Champs communs ──────────────────────────────────────────────────────────
// Les clés sont celles déjà stockées dans `patients.insurer_data` quand elles
// existaient : renommer une clé ferait disparaître une valeur déjà saisie.

const NOM_ASSURE: ChampOrganisme = {
  cle: 'assure',
  label: 'Nom et prénom de l\'assuré',
  aide: 'Laisser vide si c\'est le patient lui-même.',
}
const CIN_ASSURE: ChampOrganisme = {
  cle: 'cin_assure',
  label: 'CIN de l\'assuré',
  cases: 10,
}
const ADRESSE_ASSURE: ChampOrganisme = {
  cle: 'adresse_assure',
  label: 'Adresse de l\'assuré',
  aide: 'Celle du formulaire. Laisser vide pour reprendre l\'adresse du patient.',
}
const LIEN: ChampOrganisme = {
  cle: 'lien',
  label: 'Lien avec l\'assuré',
  aide: 'Laisser vide si l\'assuré est le patient.',
}

/** Les quatre cases « Type de soins » du formulaire ANAM. Le CNOPS écrit
 *  « Orthodentie et O.D.F », la CNSS « Orthodontie faciale » : même case. */
const TYPES_ANAM: { cle: TypeSoin; label: string }[] = [
  { cle: 'soins', label: 'Soins' },
  { cle: 'prothese', label: 'Prothèse' },
  { cle: 'orthodontie', label: 'Orthodontie' },
  { cle: 'autres', label: 'Autres' },
]

export const ORGANISMES: Organisme[] = [
  // ── CNSS ──────────────────────────────────────────────────────────────────
  {
    cle: 'cnss',
    nom: 'CNSS (AMO)',
    alias: ['cnss', 'amo', 'cnss amo'],
    intitule: 'CNSS — Assurance Maladie Obligatoire',
    gabarit: 'anam',
    champs: [
      NOM_ASSURE,
      { cle: 'immatriculation', label: 'N° d\'immatriculation CNSS', aide: 'Celui qui figure sur la carte de l\'assuré.', cases: 10 },
      CIN_ASSURE,
      ADRESSE_ASSURE,
      LIEN,
    ],
    liens: ['Conjoint', 'Enfant', 'Lui même'],
    typesSoins: TYPES_ANAM,
    colonneCode: true,
    colonneCotation: true,
    schemaDentaire: true,
    ententePrealable: true,
    delai: {
      mois: 2,
      depuis: 'premier_acte',
      texte: 'La feuille de soins ainsi que les pièces justificatives doivent être présentées à la CNSS dans les deux mois qui suivent le premier acte médical, sauf s\'il y a traitement médical continu. Dans ce dernier cas, le dossier doit être présenté dans les soixante (60) jours qui suivent la fin du traitement.',
    },
    accordPrealable: [
      'Orthodontie : l\'accord préalable concerne les actes D628 à D641, demandé au premier semestre, avec feuille de soins, devis et bilan orthodontique.',
      'D629 et D630 : la demande d\'accord doit être faite avant l\'âge de 16 ans.',
      'D634 et D635 : forfait et acte à débuter avant 18 ans, avec bilan orthodontique.',
      'D636 et D637 : devis annuel nécessaire.',
    ],
  },

  // ── CNOPS ─────────────────────────────────────────────────────────────────
  {
    cle: 'cnops',
    nom: 'CNOPS',
    alias: ['cnops', 'cnops (secteur public)'],
    intitule: 'CNOPS — secteur public',
    gabarit: 'anam',
    champs: [
      NOM_ASSURE,
      { cle: 'affiliation', label: 'N° d\'affiliation', cases: 8 },
      { cle: 'immatriculation', label: 'N° d\'immatriculation', cases: 10 },
      CIN_ASSURE,
      { cle: 'mutuelle_rattachement', label: 'Mutuelle de rattachement', aide: 'Celle qui gère le dossier et appose son cachet.' },
      ADRESSE_ASSURE,
      LIEN,
    ],
    // Le formulaire du CNOPS n'offre que deux cases : pas de « Lui même ».
    liens: ['Conjoint', 'Enfant'],
    typesSoins: TYPES_ANAM,
    colonneCode: true,
    colonneCotation: true,
    schemaDentaire: true,
    ententePrealable: true,
    delai: {
      mois: 2,
      depuis: 'premier_acte',
      texte: 'La feuille de soins ainsi que les pièces justificatives doivent être présentées à votre mutuelle dans les deux mois qui suivent le premier acte médical, sauf s\'il y a traitement médical continu. Dans ce dernier cas, le dossier doit être présenté dans les soixante (60) jours qui suivent la fin du traitement.',
    },
    accordPrealable: [
      'Orthodontie : l\'accord préalable concerne les actes D628 à D641, demandé au premier semestre, avec feuille de soins, devis et bilan orthodontique.',
      'D629 et D630 : la demande d\'accord doit être faite avant l\'âge de 16 ans.',
      'D634 et D635 : forfait et acte à débuter avant 18 ans, avec bilan orthodontique.',
      'D636 et D637 : devis annuel nécessaire.',
    ],
  },

  // ── Mutuelle des FAR ──────────────────────────────────────────────────────
  // Son imprimé n'est pas une feuille de soins dentaires mais une « feuille de
  // maladie » commune à toutes les spécialités : une seule colonne « Natures
  // des actes & coefficients », pas de code d'acte, pas de schéma dentaire.
  {
    cle: 'far',
    nom: 'FAR',
    alias: ['far', 'mutuelle des far', 'forces armées royales', 'mutuelle far'],
    intitule: 'Mutuelle des Forces Armées Royales',
    gabarit: 'far',
    champs: [
      NOM_ASSURE,
      CIN_ASSURE,
      { cle: 'compte_bancaire', label: 'N° de compte de l\'adhérent', aide: 'Le formulaire de la mutuelle le demande pour le virement.' },
      { cle: 'telephone_assure', label: 'Téléphone de l\'adhérent' },
      { cle: 'grade', label: 'Grade' },
      { cle: 'unite', label: 'Unité' },
      ADRESSE_ASSURE,
      LIEN,
    ],
    liens: ['Adhérent', 'Conjoint', 'Enfant'],
    typesSoins: null,
    colonneCode: false,
    colonneCotation: true,
    schemaDentaire: false,
    ententePrealable: false,
    delai: {
      mois: 3,
      depuis: 'premier_acte',
      texte: 'La feuille de soins doit parvenir à la Mutuelle des F.A.R au plus tard 3 mois après la date de consultation. L\'identité du malade doit être portée de la main du médecin traitant.',
    },
    accordPrealable: [],
  },

  // ── RMA Watanya ───────────────────────────────────────────────────────────
  {
    cle: 'rma',
    nom: 'RMA Watanya',
    alias: ['rma', 'rma watanya', 'royale marocaine d\'assurance'],
    intitule: 'RMA Watanya',
    gabarit: 'rma',
    champs: [
      { cle: 'affiliation', label: 'N° d\'affiliation', cases: 16 },
      { cle: 'souscripteur', label: 'Souscripteur', aide: 'L\'employeur ou l\'organisme qui a souscrit le contrat.' },
      { cle: 'police', label: 'N° de police' },
      NOM_ASSURE,
      ADRESSE_ASSURE,
      LIEN,
    ],
    liens: [],
    typesSoins: null,
    colonneCode: false,
    colonneCotation: true,
    schemaDentaire: true,
    ententePrealable: true,
    delai: {
      mois: 3,
      depuis: 'dernier_acte',
      texte: 'Délai de remise des pièces : toutes les pièces concernant une maladie ou un accident doivent être remises à l\'assureur trois mois au plus tard après la cessation des soins. Toute réclamation doit être formulée au plus tard dans un délai de deux mois.',
    },
    accordPrealable: [
      'Les prothèses dentaires sont soumises à l\'accord préalable de l\'assureur.',
      'Les extractions multiples au dessus de 5 dents, les soins spéciaux, parodontoses sont soumises à l\'accord préalable de l\'assureur.',
      'L\'orthopédie dento-faciale (ODF) est prise en charge pour les enfants âgés de moins de 12 ans.',
    ],
  },

  // ── Assureur privé dont on n'a pas l'imprimé ──────────────────────────────
  // On ne devine PAS un formulaire qu'on n'a pas vu : on imprime la feuille
  // neutre de MonRDV, à agrafer à celui de l'assureur. Les champs sont ceux
  // que tous les assureurs privés demandent.
  {
    cle: 'prive',
    nom: 'Assurance privée',
    alias: ['privée', 'privee', 'assurance', 'mutuelle privée'],
    intitule: 'Assurance privée',
    gabarit: 'neutre',
    champs: [
      { cle: 'compagnie', label: 'Compagnie', aide: 'Le nom de l\'assureur, tel qu\'il figure sur la carte.' },
      NOM_ASSURE,
      { cle: 'police', label: 'N° de police / contrat' },
      { cle: 'adherent', label: 'N° d\'adhérent', aide: 'S\'il est distinct du numéro de police.' },
      ADRESSE_ASSURE,
      LIEN,
    ],
    liens: [],
    typesSoins: null,
    colonneCode: false,
    colonneCotation: false,
    schemaDentaire: false,
    ententePrealable: false,
    delai: {
      mois: 3,
      depuis: 'dernier_acte',
      texte: 'Délai variable selon le contrat. Les assureurs marocains demandent couramment les pièces dans les trois mois qui suivent la fin des soins.',
    },
    accordPrealable: [
      'Les prothèses et l\'orthodontie sont généralement soumises à un accord préalable. À vérifier sur le contrat.',
    ],
  },
]

/** L'organisme d'une mutuelle enregistrée sur la fiche patient.
 *
 *  Une mutuelle inconnue (saisie libre) retombe sur un jeu minimal plutôt que
 *  sur rien : mieux vaut un nom d'assuré et une référence que du papier à
 *  remplir entièrement à la main. */
export function organismePour(mutuelle: string | null | undefined): Organisme | null {
  const m = (mutuelle ?? '').trim()
  if (!m || m === 'Aucune') return null
  const bas = m.toLowerCase()
  const connu = ORGANISMES.find(
    (o) => o.nom.toLowerCase() === bas || (o.alias ?? []).includes(bas),
  )
  if (connu) return connu
  return {
    cle: 'autre',
    nom: m,
    intitule: m,
    gabarit: 'neutre',
    champs: [NOM_ASSURE, { cle: 'reference', label: 'N° d\'assuré / référence' }, ADRESSE_ASSURE, LIEN],
    liens: [],
    typesSoins: null,
    colonneCode: false,
    colonneCotation: false,
    schemaDentaire: false,
    ententePrealable: false,
    delai: {
      mois: 3,
      depuis: 'dernier_acte',
      texte: 'Délai inconnu pour cet organisme. À vérifier sur son formulaire.',
    },
    accordPrealable: [],
  }
}

/** L'organisme désigné par sa clé — celle que porte une feuille établie. */
export function organismeParCle(cle: string | null | undefined): Organisme | null {
  if (!cle) return null
  return ORGANISMES.find((o) => o.cle === cle) ?? null
}

/** Une clé stockée en base → un libellé lisible, sans déclaration. Sert aux
 *  valeurs saisies sous une version antérieure du registre : les retirer du
 *  tableau ci-dessus ne doit pas les faire DISPARAÎTRE du document. */
function humaniser(cle: string): string {
  const mot = cle.replace(/_/g, ' ')
  return mot.charAt(0).toUpperCase() + mot.slice(1)
}

/** Les champs renseignés, prêts à être imprimés : libellé + valeur, dans
 *  l'ordre du formulaire, sans les cases laissées vides.
 *
 *  Les valeurs stockées sous une clé que le registre ne déclare plus sont
 *  imprimées À LA SUITE, sous un libellé déduit de la clé. Une information
 *  saisie par le praticien ne disparaît jamais d'un document parce que le
 *  logiciel a changé d'avis sur la liste des champs. */
export function champsRenseignes(
  mutuelle: string | null | undefined,
  donnees: Record<string, unknown> | null | undefined,
): { label: string; valeur: string }[] {
  const org = organismePour(mutuelle)
  if (!org || !donnees) return []
  const declares = org.champs
    .map((c) => ({ label: c.label, valeur: String(donnees[c.cle] ?? '').trim() }))
    .filter((c) => c.valeur !== '')
  const vus = new Set(org.champs.map((c) => c.cle))
  const orphelins = Object.entries(donnees)
    .filter(([cle, v]) => !vus.has(cle) && String(v ?? '').trim() !== '')
    .map(([cle, v]) => ({ label: humaniser(cle), valeur: String(v).trim() }))
  return [...declares, ...orphelins]
}
