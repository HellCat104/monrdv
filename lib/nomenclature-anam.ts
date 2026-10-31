// Le référentiel médico-administratif des actes dentaires de l'ANAM.
//
// ── CE QUE C'EST, ET CE QUE CE N'EST PAS ────────────────────────────────────
//
// C'est le document de l'Agence Nationale de l'Assurance Maladie qui dit, pour
// chaque famille d'actes dentaires, QUELLES PIÈCES doivent accompagner la
// feuille de soins. Ce n'est PAS un tarif, et ce n'est pas la liste des
// libellés : il donne des PLAGES de codes (« Extractions chirurgicales D720 à
// D732 »), pas un code par acte. Le logiciel ne peut donc pas en déduire le
// nom d'un acte ni son prix — et il ne l'invente pas.
//
// Ce qu'il peut faire, et que personne ne fait aujourd'hui : regarder les
// actes portés sur une feuille et dire au praticien ce qu'il doit agrafer
// avant de la remettre. Un dossier renvoyé six semaines plus tard pour une
// radio manquante, c'est six semaines perdues pour le patient.
//
// ── LA RÈGLE QUI COÛTE LE PLUS CHER ─────────────────────────────────────────
//
// « La date de la radio (avant) justifiant un acte ne doit pas dépasser 6 mois
// par rapport à la date d'exécution de ce dernier, à défaut l'acte ne sera pas
// remboursé. » Depuis la v94, MonRDV connaît la date d'examen de chaque image
// et les dents qu'elle montre : c'est la seule règle du référentiel que le
// logiciel peut vérifier tout seul, et il la vérifie.

/** Une pièce à joindre, dans les mots du référentiel. */
export interface PieceJustificative {
  /** Court, pour une case à cocher. */
  libelle: string
  /** Le logiciel peut-il vérifier lui-même qu'elle est là ? */
  verifiable: 'radio_avant' | 'radio_apres' | null
}

export interface FamilleActe {
  cle: string
  libelle: string
  /** Les plages de codes, bornes incluses. Un acte y appartient si son code
   *  tombe dans l'une d'elles. */
  plages: [number, number][]
  /** Codes isolés, hors plage. */
  codes?: number[]
  pieces: PieceJustificative[]
  /** Les actes de cette famille passent par un accord préalable. */
  accordPrealable?: boolean
  /** Une note propre à la famille, citée telle quelle. */
  note?: string
}

const FEUILLE: PieceJustificative = { libelle: 'Feuille de soins', verifiable: null }
const RADIO_AVANT: PieceJustificative = { libelle: 'Radiographie rétro-alvéolaire avant', verifiable: 'radio_avant' }
const RADIO_APRES: PieceJustificative = { libelle: 'Radiographie rétro-alvéolaire après', verifiable: 'radio_apres' }
const RADIO_PREOP: PieceJustificative = { libelle: 'Radiographie pré-opératoire', verifiable: 'radio_avant' }

export const FAMILLES_ANAM: FamilleActe[] = [
  {
    cle: 'obturations',
    libelle: 'Obturations dentaires définitives',
    plages: [[700, 702]],
    pieces: [FEUILLE],
  },
  {
    cle: 'pulpe',
    libelle: 'Soins de la pulpe et des canaux',
    plages: [[703, 706]],
    pieces: [FEUILLE, RADIO_AVANT, RADIO_APRES],
  },
  {
    cle: 'ancrage',
    libelle: 'Restauration avec ancrage radiculaire',
    plages: [[707, 707]],
    pieces: [FEUILLE, RADIO_APRES],
  },
  {
    cle: 'parodontie',
    libelle: 'Hygiène bucco-dentaire et soins parodontiques',
    plages: [[708, 712], [911, 914]],
    codes: [907, 908],
    pieces: [FEUILLE],
  },
  {
    cle: 'extractions',
    libelle: 'Extractions dentaires',
    plages: [[713, 719]],
    pieces: [FEUILLE],
  },
  {
    cle: 'extractions_chir',
    libelle: 'Extractions chirurgicales',
    plages: [[720, 732]],
    pieces: [FEUILLE, RADIO_PREOP],
  },
  {
    cle: 'gencives',
    libelle: 'Chirurgie des gencives et des muqueuses',
    plages: [[733, 744]],
    pieces: [FEUILLE],
    note: 'Radiographie pré-opératoire pour D733, D734 et pour D738 à D741.',
  },
  {
    cle: 'preprothetique',
    libelle: 'Chirurgie préprothétique',
    plages: [[745, 747]],
    pieces: [FEUILLE],
  },
  {
    cle: 'prothese_conjointe',
    libelle: 'Prothèse dentaire conjointe',
    plages: [[748, 760], [900, 905]],
    pieces: [FEUILLE, RADIO_AVANT],
    note: 'Radiographie avant, sauf pour D756 et D904. La radiographie après est laissée à l\'appréciation du contrôle médical des organismes gestionnaires.',
  },
  {
    cle: 'prothese_adjointe',
    libelle: 'Prothèse dentaire adjointe',
    plages: [[761, 785]],
    codes: [909],
    pieces: [FEUILLE],
  },
  {
    cle: 'maxillo',
    libelle: 'Prothèse restauratrice maxillo-faciale',
    plages: [[800, 813]],
    pieces: [FEUILLE],
  },
  {
    cle: 'odf_bilan',
    libelle: 'Orthodontie — examens et diagnostic',
    plages: [[626, 627]],
    pieces: [FEUILLE, { libelle: 'Bilan orthodontique', verifiable: null }],
    note: 'Au-delà de 16 ans, spécifier le motif de réalisation du bilan orthodontique.',
  },
  {
    cle: 'odf_traitement',
    libelle: 'Orthodontie — traitements',
    plages: [[628, 641]],
    accordPrealable: true,
    pieces: [
      FEUILLE,
      { libelle: 'Devis', verifiable: null },
      { libelle: 'Bilan orthodontique', verifiable: null },
    ],
    note: 'Accord préalable demandé uniquement le premier semestre. Remboursement semestriel : feuille de soins et note d\'honoraires. D629 et D630 : demande avant 16 ans. D634 et D635 : forfait et acte à débuter avant 18 ans. D636 et D637 : devis annuel nécessaire. Un semestre ne peut être entamé qu\'après la fin du précédent.',
  },
  {
    cle: 'autres_chirurgies',
    libelle: 'Autres chirurgies',
    plages: [[600, 602]],
    codes: [435, 509, 510, 512, 513, 531, 607, 608, 621],
    pieces: [FEUILLE],
    note: 'Radiographie pré-opératoire pour D600 à D602, D607 et D608.',
  },
]

/** Les règles générales du référentiel, citées telles quelles. Elles ne
 *  dépendent d'aucun code : elles valent pour toute feuille AMO. */
export const REGLES_GENERALES = [
  'Le nom du patient, le nom du praticien et son code INPE sur l\'ordonnance.',
  'Le code INPE sur tous les imprimés AMO.',
  'La date, le nom du patient, les dents concernées et le cachet du praticien sur les radiographies numériques ou copies numérisées.',
  'La radiographie rétro-alvéolaire argentique doit être rattachée à une ordonnance indiquant la date, l\'identifiant du patient, les dents concernées et le cachet du praticien.',
  'La prescription et la facture si la radio est réalisée chez un radiologue.',
  'La date de la radio (avant) justifiant un acte ne doit pas dépasser 6 mois par rapport à la date d\'exécution de ce dernier, à défaut l\'acte ne sera pas remboursé.',
  'La date de chaque prescription doit correspondre à une date remplie sur la feuille de soins.',
  'Les identifiants fiscaux (ICE, I.F) doivent être portés sur la feuille de soins.',
] as const

/** Au-delà de ce délai, la radiographie « avant » ne justifie plus l'acte. */
export const MOIS_VALIDITE_RADIO = 6

/** Le numéro d'un code de nomenclature : « D726 » → 726, « d 726 » → 726.
 *  Rend null pour tout ce qui n'est pas un code dentaire (« T150 », un libellé
 *  libre, une case vide) : une famille ne se devine pas. */
export function numeroCode(code: string | null | undefined): number | null {
  const m = /^\s*[Dd]\s*(\d{3})\s*$/.exec(String(code ?? ''))
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** La famille d'un code, ou null s'il n'est dans aucune — un code hors
 *  référentiel n'est pas une erreur : le praticien peut coter un acte que ce
 *  document ne couvre pas. */
export function familleDuCode(code: string | null | undefined): FamilleActe | null {
  const n = numeroCode(code)
  if (n === null) return null
  return (
    FAMILLES_ANAM.find(
      (f) =>
        f.plages.some(([a, b]) => n >= a && n <= b) || (f.codes ?? []).includes(n),
    ) ?? null
  )
}

/** Les pièces à joindre pour un jeu d'actes, sans doublon, dans l'ordre du
 *  référentiel. La feuille de soins elle-même n'est pas listée : on ne
 *  demande pas au praticien de joindre le document qu'il est en train
 *  d'imprimer. */
export function piecesAJoindre(
  codes: (string | null | undefined)[],
): { piece: PieceJustificative; pour: string[] }[] {
  const parPiece = new Map<string, { piece: PieceJustificative; pour: string[] }>()
  for (const code of codes) {
    const famille = familleDuCode(code)
    if (!famille) continue
    for (const piece of famille.pieces) {
      if (piece.libelle === FEUILLE.libelle) continue
      const vu = parPiece.get(piece.libelle)
      if (vu) {
        if (!vu.pour.includes(famille.libelle)) vu.pour.push(famille.libelle)
      } else {
        parPiece.set(piece.libelle, { piece, pour: [famille.libelle] })
      }
    }
  }
  return Array.from(parPiece.values())
}

/** Les actes qui, d'après le référentiel, passent par un accord préalable. */
export function actesSousAccord(codes: (string | null | undefined)[]): string[] {
  const vus = new Set<string>()
  for (const code of codes) {
    const famille = familleDuCode(code)
    if (famille?.accordPrealable) vus.add(famille.libelle)
  }
  return Array.from(vus)
}
