// Organismes de couverture — ce que CHACUN demande sur sa feuille de soins.
//
// POURQUOI UN REGISTRE PLUTÔT QUE TROIS COLONNES
//
// La première version ne connaissait qu'un assuré : nom, immatriculation,
// lien. C'est le cas CNSS. Mais le CNOPS demande un numéro d'affiliation et la
// mutuelle de rattachement, les FAR une immatriculation militaire, et un
// assureur privé un numéro de police et le souscripteur du contrat. Trois
// colonnes fixes obligeaient à écrire le reste à la main — c'est-à-dire à
// recopier, ce que ce chantier doit faire disparaître.
//
// Les champs sont donc déclarés ici, par organisme, et stockés en JSON sur la
// fiche patient puis RECOPIÉS sur la feuille établie.
//
// CE QUI RESTE À CONFIRMER
//
// Les libellés ci-dessous sont ceux qu'on retrouve couramment sur les
// formulaires ; ils doivent être relus sur les vraies feuilles de chaque
// organisme avant d'être présentés comme définitifs. Ajouter, renommer ou
// retirer un champ se fait ici, en un endroit : la saisie et le document
// imprimé suivent.

export interface ChampOrganisme {
  cle: string
  label: string
  /** Aide affichée sous le champ, quand le mot du formulaire n'est pas évident. */
  aide?: string
}

export interface Organisme {
  /** Valeur stockée dans `patients.mutuelle` (liste MUTUELLES_MAROC). */
  nom: string
  /** Intitulé imprimé en tête du bloc « Assuré » du document. */
  intitule: string
  champs: ChampOrganisme[]
}

/** Le lien de parenté : commun à tous les organismes, demandé partout dès que
 *  le bénéficiaire des soins n'est pas l'assuré lui-même. */
const LIEN: ChampOrganisme = {
  cle: 'lien',
  label: 'Lien avec l\'assuré',
  aide: 'Épouse, fils, fille… Laisser vide si l\'assuré est le patient.',
}

const NOM_ASSURE: ChampOrganisme = {
  cle: 'assure',
  label: 'Nom et prénom de l\'assuré',
  aide: 'Laisser vide si c\'est le patient lui-même.',
}

export const ORGANISMES: Organisme[] = [
  {
    nom: 'CNSS (AMO)',
    intitule: 'CNSS — Assurance Maladie Obligatoire',
    champs: [
      NOM_ASSURE,
      { cle: 'immatriculation', label: 'N° d\'immatriculation CNSS', aide: 'Celui qui figure sur la carte de l\'assuré.' },
      LIEN,
    ],
  },
  {
    nom: 'CNOPS',
    intitule: 'CNOPS — secteur public',
    champs: [
      NOM_ASSURE,
      { cle: 'affiliation', label: 'N° d\'affiliation' },
      { cle: 'mutuelle_rattachement', label: 'Mutuelle de rattachement', aide: 'La mutuelle qui gère le dossier.' },
      { cle: 'administration', label: 'Administration / employeur' },
      LIEN,
    ],
  },
  {
    nom: 'FAR',
    intitule: 'Forces Armées Royales',
    champs: [
      NOM_ASSURE,
      { cle: 'matricule', label: 'Matricule' },
      { cle: 'unite', label: 'Unité / formation' },
      LIEN,
    ],
  },
  {
    nom: 'Assurance privée',
    intitule: 'Assurance privée',
    champs: [
      { cle: 'compagnie', label: 'Compagnie', aide: 'Le nom de l\'assureur, tel qu\'il figure sur la carte.' },
      NOM_ASSURE,
      { cle: 'police', label: 'N° de police / contrat' },
      { cle: 'adherent', label: 'N° d\'adhérent', aide: 'S\'il est distinct du numéro de police.' },
      LIEN,
    ],
  },
]

/** L'organisme d'une mutuelle enregistrée. Une mutuelle inconnue (saisie
 *  libre « Autre… ») retombe sur un jeu de champs minimal plutôt que sur rien :
 *  mieux vaut un nom d'assuré et une référence que du papier à remplir. */
export function organismePour(mutuelle: string | null | undefined): Organisme | null {
  const m = (mutuelle ?? '').trim()
  if (!m || m === 'Aucune') return null
  const connu = ORGANISMES.find((o) => o.nom.toLowerCase() === m.toLowerCase())
  if (connu) return connu
  return {
    nom: m,
    intitule: m,
    champs: [NOM_ASSURE, { cle: 'reference', label: 'N° d\'assuré / référence' }, LIEN],
  }
}

/** Les champs renseignés, prêts à être imprimés : libellé + valeur, dans
 *  l'ordre du formulaire, sans les cases laissées vides. */
export function champsRenseignes(
  mutuelle: string | null | undefined,
  donnees: Record<string, unknown> | null | undefined,
): { label: string; valeur: string }[] {
  const org = organismePour(mutuelle)
  if (!org || !donnees) return []
  return org.champs
    .map((c) => ({ label: c.label, valeur: String(donnees[c.cle] ?? '').trim() }))
    .filter((c) => c.valeur !== '')
}
