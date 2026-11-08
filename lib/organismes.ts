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
// seuls de leur espèce, et « neutre » dit qu'on n'a pas d'imprimé pour cet
// organisme — on n'en produit alors aucun.
//
// Depuis novembre 2026, chacune des trois premières caisses est là DEUX fois :
// son imprimé dentaire et son imprimé médecin, qui ne se ressemblent pas. Voir
// `imprimes`.
//
// ── CE QUE LE REGISTRE NE DÉCRIT PLUS ───────────────────────────────────────
//
// Les CHAMPS de l'assuré — son nom, son immatriculation, sa CIN, son adresse,
// son lien de parenté. Ils étaient demandés au cabinet, puis imprimés dans le
// cadre « Partie réservée à l'assuré(e) ». Or ce cadre, l'assuré le remplit de
// sa main et signe dessous : le cabinet déclarait une identité qui n'est pas
// la sienne à déclarer. Le formulaire sort désormais vierge de ce côté-là.
//
// `liens` reste, lui : il ne sert plus à cocher, mais à DESSINER les bonnes
// cases — la CNSS en propose trois, le CNOPS deux, les FAR trois autres.
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

/** L'imprimé d'un organisme, par la profession à qui il s'adresse. */
export type ImprimeDetenu = 'dentaire' | 'medecin' | 'tout_praticien'

/** Le gabarit imprimé. « neutre » = la feuille MonRDV, à agrafer au
 *  formulaire de l'organisme : le repli quand on n'a pas son imprimé. */
export type Gabarit = 'anam' | 'rma' | 'far' | 'neutre'

/** Les cases « Type de soins » d'un imprimé.
 *
 *  Les quatre premières sont celles des feuilles DENTAIRES de l'ANAM, les
 *  quatre suivantes celles des feuilles MÉDECIN. Ce ne sont pas des variantes
 *  de vocabulaire : un dentiste déclare la nature des TRAVAUX (soins,
 *  prothèse, orthodontie), un médecin la nature de l'ÉVÉNEMENT (maladie,
 *  maternité, hospitalisation, accident). Mélanger les deux, c'est proposer
 *  « Prothèse » à un généraliste. */
export type TypeSoin =
  | 'soins' | 'prothese' | 'orthodontie' | 'autres'
  | 'maladie' | 'maternite' | 'hospitalisation' | 'accident'

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
  /** Les cases « lien de parenté » du formulaire. Vide = champ libre. */
  liens: string[]
  /** Les cases « Type de soins ». null = le formulaire n'en a pas. */
  typesSoins: { cle: TypeSoin; label: string }[] | null
  /** Le formulaire a une colonne « Code des actes ». */
  colonneCode: boolean
  /** Le formulaire a une colonne « Lettre clé + Cotation ». */
  colonneCotation: boolean
  /** …et une colonne « Valeur clé » à côté. Absent = comme `colonneCotation`.
   *  La feuille MÉDECIN de la CNSS a la cotation NGAP mais PAS la valeur de
   *  la clé : demander les deux ferait saisir un chiffre qui n'a nulle part
   *  où s'imprimer. */
  colonneValeurCle?: boolean
  /** Le formulaire porte un schéma dentaire à marquer. */
  schemaDentaire: boolean
  /** QUELS imprimés de cet organisme MonRDV détient, scannés et remplissables.
   *
   *  Une caisse ne publie pas un formulaire mais plusieurs, un par profession.
   *  La CNSS a une « Feuille de Soins Maladie » (ANAM 1.2.01.01) pour le
   *  médecin et une « Feuille de soins dentaires » (1.2.03.01) pour le
   *  chirurgien-dentiste ; le CNOPS et RMA font de même. Ce ne sont pas des
   *  variantes : le formulaire dentaire porte un schéma de dents, celui du
   *  médecin une cotation NGAP et un bloc biologie. Remettre l'un pour
   *  l'autre, c'est un dossier renvoyé.
   *
   *  'tout_praticien' vaut pour les deux : c'est le cas du carnet des FAR,
   *  dont la page 3 est « le relevé commun à tout le corps de santé » ; seule
   *  sa page 4 est celle du dentiste.
   *
   *  Liste VIDE : on ne détient aucun de ses imprimés. Le logiciel ne produit
   *  alors pas de feuille de soins du tout — voir `imprimeDisponible`. */
  imprimes: ImprimeDetenu[]
  /** CE QUI CHANGE SUR L'IMPRIMÉ DU MÉDECIN.
   *
   *  Tout ce qui est décrit au-dessus l'a été sur l'imprimé DENTAIRE, parce
   *  que c'est lui qui est arrivé le premier. Or une caisse publie un
   *  formulaire par profession, et ils ne posent pas les mêmes questions :
   *  la feuille dentaire de la CNSS demande « Soins / Prothèse /
   *  Orthodontie / Autres », sa feuille médecin « Hospitalisation /
   *  Maternité / Accident / Maladie ». Un généraliste à qui l'on propose de
   *  cocher « Prothèse » voit un écran qui ne parle pas de son métier.
   *
   *  Absent, ou champ absent : l'imprimé médecin pose la même question que
   *  le dentaire. `imprimeTraits()` applique ces écarts. */
  medecin?: TraitsImprime
  /** Le formulaire porte la case « Entente préalable / Devis ». */
  ententePrealable: boolean
  /** Les mots de CE formulaire pour cette case. L'ANAM écrit « Entente
   *  préalable » et « Exécution », RMA « Devis » et « Exécution », les FAR
   *  « Devis ? » et « Reçus ? ». L'écran les cite au lieu d'inventer un
   *  vocabulaire commun : le praticien doit reconnaître son imprimé. */
  motsNature?: { execution: string; entente: string }
  /** Le formulaire a une case « N° Entente préalable ». Seuls les imprimés de
   *  l'ANAM en ont une : RMA et les FAR posent la question du devis sans
   *  demander de numéro en retour, et proposer la case ferait saisir un
   *  renseignement qui n'a nulle part où aller. */
  numeroEntente?: boolean
  delai: DelaiDepot
  /** Ce qui, chez cet organisme, exige un accord AVANT d'être posé. Les mots
   *  sont ceux du formulaire : on les cite, on ne les reformule pas. */
  accordPrealable: string[]
}

/** Ce qu'un imprimé « médecin » redéfinit par rapport au dentaire. Les mêmes
 *  champs que l'organisme, tous facultatifs : on ne réécrit que l'écart. */
export interface TraitsImprime {
  typesSoins?: { cle: TypeSoin; label: string }[] | null
  colonneCode?: boolean
  colonneCotation?: boolean
  colonneValeurCle?: boolean
  schemaDentaire?: boolean
  ententePrealable?: boolean
  numeroEntente?: boolean
  motsNature?: { execution: string; entente: string }
}

/** Les quatre cases « Type de soins » du formulaire ANAM. Le CNOPS écrit
 *  « Orthodentie et O.D.F », la CNSS « Orthodontie faciale » : même case. */
const TYPES_ANAM: { cle: TypeSoin; label: string }[] = [
  { cle: 'soins', label: 'Soins' },
  { cle: 'prothese', label: 'Prothèse' },
  { cle: 'orthodontie', label: 'Orthodontie' },
  { cle: 'autres', label: 'Autres' },
]

/** Les quatre cases « Type de soins » des feuilles MÉDECIN de l'ANAM.
 *
 *  Elles décrivent l'ÉVÉNEMENT, pas les travaux. Le logiciel ne peut pas les
 *  deviner : une consultation qui suit un accident du travail cochée
 *  « Maladie » fait rejeter le dossier, et la caisse ne corrige pas, elle
 *  renvoie. C'est donc le praticien qui coche, et rien n'est coché d'office.
 *
 *  L'ordre est celui de l'imprimé — la CNSS les aligne horizontalement
 *  Hospitalisation / Maternité / Accident / Maladie, le CNOPS les empile
 *  Maladie / Maternité / Hospitalisation / Accident. On suit chacun le sien
 *  pour que l'écran ressemble au papier qu'on a sous les yeux. */
const TYPES_MEDECIN_CNSS: { cle: TypeSoin; label: string }[] = [
  { cle: 'hospitalisation', label: 'Hospitalisation' },
  { cle: 'maternite', label: 'Maternité' },
  { cle: 'accident', label: 'Accident' },
  { cle: 'maladie', label: 'Maladie' },
]

const TYPES_MEDECIN_CNOPS: { cle: TypeSoin; label: string }[] = [
  { cle: 'maladie', label: 'Maladie' },
  { cle: 'maternite', label: 'Maternité' },
  { cle: 'hospitalisation', label: 'Hospitalisation' },
  { cle: 'accident', label: 'Accident' },
]

export const ORGANISMES: Organisme[] = [
  // ── CNSS ──────────────────────────────────────────────────────────────────
  {
    cle: 'cnss',
    nom: 'CNSS (AMO)',
    alias: ['cnss', 'amo', 'cnss amo'],
    intitule: 'CNSS — Assurance Maladie Obligatoire',
    gabarit: 'anam',
    liens: ['Conjoint', 'Enfant', 'Lui même'],
    typesSoins: TYPES_ANAM,
    colonneCode: true,
    colonneCotation: true,
    schemaDentaire: true,
    imprimes: ['dentaire', 'medecin'],
    // La feuille MÉDECIN de la CNSS (ANAM 1.2.01.01) garde les deux cases
    // « Entente préalable / Exécution » en tête, mais elle ne demande AUCUN
    // numéro d'accord en retour, son tableau d'actes n'a pas de colonne
    // « Valeur clé », et son « Type de soins » parle de l'événement.
    medecin: {
      typesSoins: TYPES_MEDECIN_CNSS,
      numeroEntente: false,
      colonneValeurCle: false,
      schemaDentaire: false,
    },
    ententePrealable: true,
    motsNature: { execution: 'Exécution', entente: 'Entente préalable' },
    numeroEntente: true,
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
    // Le formulaire du CNOPS n'offre que deux cases : pas de « Lui même ».
    liens: ['Conjoint', 'Enfant'],
    typesSoins: TYPES_ANAM,
    colonneCode: true,
    colonneCotation: true,
    schemaDentaire: true,
    imprimes: ['dentaire', 'medecin'],
    // La feuille MÉDECIN du CNOPS (ANAM 1.1.01.01) ne pose PAS la question
    // « Entente préalable / Exécution » : la case n'existe pas sur cet
    // imprimé. Elle a en revanche sa colonne « Valeur Clé ».
    medecin: {
      typesSoins: TYPES_MEDECIN_CNOPS,
      ententePrealable: false,
      numeroEntente: false,
      schemaDentaire: false,
    },
    ententePrealable: true,
    motsNature: { execution: 'Exécution', entente: 'Entente préalable' },
    numeroEntente: true,
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
  // Son imprimé est une « feuille de maladie » commune à toutes les
  // spécialités — quatre pages, dont une seule est celle du dentiste. La
  // page 1 identifie l'adhérent et le bénéficiaire, la page 2 est
  // l'ordonnance du pharmacien, la page 3 le relevé commun à tout le corps de
  // santé, et la page 4 « SOINS ET PROTHESE DENTAIRE (INPE) » est la nôtre.
  {
    cle: 'far',
    nom: 'FAR',
    alias: ['far', 'mutuelle des far', 'forces armées royales', 'mutuelle far'],
    intitule: 'Mutuelle des Forces Armées Royales',
    gabarit: 'far',
    liens: ['Adhérent', 'Conjoint', 'Enfant'],
    // La page 4 de l'imprimé est une page DENTAIRE à part entière — ce que la
    // première lecture, faite sur les pages 1 et 3, avait manqué. Elle porte
    // ses deux cases « Soins ? » et « Prothèse ? », sa question « DEVIS ? —
    // REÇUS ? », et une grille de dents numérotées.
    typesSoins: [
      { cle: 'soins', label: 'Soins' },
      { cle: 'prothese', label: 'Prothèse' },
    ],
    // Pas de colonne « code » : la mutuelle demande « Nature des travaux » et
    // un coefficient, jamais le numéro ANAM de l'acte.
    colonneCode: false,
    colonneCotation: true,
    // Une grille de numéros, pas l'arcade dessinée des autres imprimés : on
    // croise la dent extraite ou appareillée, on entoure la dent soignée.
    schemaDentaire: true,
    imprimes: ['tout_praticien'],
    // Dans le carnet des FAR, les cases « Soins ? / Prothèse ? » et la
    // mention « DEVIS ? — REÇUS ? » sont sur la PAGE 4, celle du dentiste,
    // qui ne s'imprime pas pour un médecin. Il ne reste que la page 3, le
    // relevé commun : rien à cocher.
    medecin: {
      typesSoins: null,
      ententePrealable: false,
      schemaDentaire: false,
    },
    ententePrealable: true,
    motsNature: { execution: 'Reçus', entente: 'Devis' },
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
    liens: [],
    typesSoins: null,
    colonneCode: false,
    colonneCotation: true,
    schemaDentaire: true,
    imprimes: ['dentaire', 'medecin'],
    // Chez RMA, la « Déclaration de maladie » (FOR.GM-021) réserve toute sa
    // page 1 à l'assuré — type de déclaration compris. La page du praticien
    // ne porte qu'un tableau d'actes.
    medecin: {
      ententePrealable: false,
      schemaDentaire: false,
    },
    ententePrealable: true,
    motsNature: { execution: 'Exécution', entente: 'Devis' },
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
  // On ne devine PAS un formulaire qu'on n'a pas vu, et on n'en fabrique pas
  // un à la place : la feuille de soins est alors « indisponible », et le
  // praticien remplit celui de l'assureur à la main. Ce qui reste ici — délai,
  // accord préalable — sert à l'écran qui prévient, pas à un document.
  {
    cle: 'prive',
    nom: 'Assurance privée',
    alias: ['privée', 'privee', 'assurance', 'mutuelle privée'],
    intitule: 'Assurance privée',
    gabarit: 'neutre',
    liens: [],
    typesSoins: null,
    colonneCode: false,
    colonneCotation: false,
    schemaDentaire: false,
    imprimes: [],
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
    liens: [],
    typesSoins: null,
    colonneCode: false,
    colonneCotation: false,
    schemaDentaire: false,
    imprimes: [],
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

/**
 * MonRDV détient-il l'imprimé de cet organisme POUR CE PRATICIEN ?
 *
 * C'est la seule question qui décide si une feuille de soins sort ou non. Un
 * « non » ne se rattrape pas par un document maison : un formulaire officiel
 * se remplit, il ne se dessine pas, et une feuille MonRDV présentée à une
 * caisse qui attend le sien revient par la poste. L'écran dit alors
 * « indisponible », et pourquoi.
 */
/** L'organisme TEL QUE L'IMPRIMÉ DE CETTE PROFESSION le décrit.
 *
 *  Toute l'interface passe par là : les cases à cocher, les colonnes de
 *  saisie, les alertes. Avant, elle lisait l'organisme brut — c'est-à-dire
 *  l'imprimé du dentiste — et un généraliste se voyait proposer de cocher
 *  « Prothèse » et de saisir une valeur de clé que son formulaire n'a pas.
 *
 *  On ne renvoie pas un objet partiel : c'est le même organisme, décrit par
 *  le bon papier. */
export function imprimeTraits<T extends Organisme | null | undefined>(
  organisme: T, estDentiste: boolean,
): T {
  if (!organisme || estDentiste || !organisme.medecin) return organisme
  return { ...organisme, ...organisme.medecin }
}

/** Le formulaire a-t-il une colonne « Valeur clé » ? Par défaut, celle-ci
 *  accompagne la colonne de cotation. */
export function aValeurCle(organisme: Organisme | null | undefined): boolean {
  if (!organisme) return false
  return organisme.colonneValeurCle ?? organisme.colonneCotation
}

export function imprimeDisponible(
  organisme: Organisme | null | undefined, estDentiste: boolean,
): boolean {
  if (!organisme) return false
  if (organisme.imprimes.includes('tout_praticien')) return true
  return organisme.imprimes.includes(estDentiste ? 'dentaire' : 'medecin')
}
