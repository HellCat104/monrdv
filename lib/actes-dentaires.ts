// Le catalogue des actes dentaires cotés — ce que le praticien COCHE.
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
//
// Jusqu'ici, le code de nomenclature se tapait à la main, acte par acte, et
// le logiciel se contentait de reproposer ce qui avait déjà été écrit. Un
// code faux ne se voyait qu'au retour du dossier, des semaines plus tard.
//
// Ici, le praticien ne tape plus de code : il coche ce qu'il a fait, et le
// code vient avec. C'est le sens de ce catalogue — une liste fermée, où
// chaque entrée porte en plus les TROIS CONTRAINTES que l'organisme vérifie :
// faut-il préciser la dent, la face, et l'acte passe-t-il par un accord
// préalable. Ce sont elles qui font rejeter un dossier automatiquement.
//
// ── CE QU'IL N'EST PAS ──────────────────────────────────────────────────────
//
// Ce n'est pas le référentiel médico-administratif de l'ANAM : celui-là vit
// dans lib/nomenclature-anam.ts, il donne les PLAGES de codes et les pièces à
// joindre, et il vient du document officiel. Celui-ci est la liste des actes
// que le cabinet coche au quotidien, dressée depuis le dossier technique
// « Mode ia code dentiste ».
//
// ⚠ LES DEUX SE CONTREDISENT SUR SIX CODES, et il faut le savoir :
//
//     code   ici                            référentiel ANAM (plages)
//     D707   coiffage pulpaire              ancrage radiculaire
//     D716   urgence / pulpite aiguë        extractions (713–719)
//     D719   fluor, scellement de sillons   extractions (713–719)
//     D626   traitement ODF actif           bilan orthodontique (626–627)
//     D630   forfait de fin de traitement   traitement ODF (628–641)
//     D748→D752  prothèse ADJOINTE          prothèse CONJOINTE (748–760)
//
// Le document d'où vient cette liste porte lui-même la mention « AI responses
// may include mistakes ». Un code mal attribué ne se voit pas à l'écran : il
// se voit au rejet. CES SIX LIGNES SONT À FAIRE CONFIRMER PAR UN DENTISTE
// avant d'être présentées à un cabinet.
//
// En attendant, c'est CE catalogue qui fait foi quand il connaît le code —
// voir `familleDeLActe` — parce qu'il nomme l'acte, là où le référentiel ne
// connaît qu'une plage de numéros.

/** La dent concernée par l'acte : une seule, un bloc, ou aucune. */
export type ExigenceDent = 'une' | 'bloc' | null

export interface ActeDentaire {
  code: string
  libelle: string
  /** L'organisme exige-t-il le numéro de la dent (FDI) ? */
  dent: ExigenceDent
  /** L'organisme exige-t-il la face traitée (mésiale, occlusale…) ? */
  face: boolean
  /** L'acte passe-t-il par un accord préalable de l'organisme ? */
  accord: boolean
  /** Acte non remboursé : l'imprimé l'accepte, la caisse ne le paie pas. */
  horsNomenclature?: boolean
  /** À quelle famille l'acte appartient, quand le numéro seul induirait en
   *  erreur. Sert aux imprimés qui séparent les prothèses des soins. */
  famille?: 'soins' | 'prothese_conjointe' | 'prothese_adjointe' | 'odf' | 'extraction' | 'radio'
}

export interface GroupeActes {
  cle: string
  titre: string
  actes: ActeDentaire[]
}

export const GROUPES_ACTES: GroupeActes[] = [
  {
    cle: 'urgence',
    titre: 'Consultations et urgences',
    actes: [
      { code: 'C', libelle: 'Consultation au cabinet', dent: null, face: false, accord: false },
      { code: 'V', libelle: 'Visite au domicile du malade', dent: null, face: false, accord: false },
      { code: 'D716', libelle: "Traitement d'urgence d'une pulpite aiguë / sédation douloureuse", dent: 'une', face: false, accord: false, famille: 'soins' },
      { code: 'D707', libelle: 'Coiffage pulpaire direct (protection du nerf)', dent: 'une', face: false, accord: false, famille: 'soins' },
    ],
  },
  {
    cle: 'conservateur',
    titre: 'Soins conservateurs et endodontie',
    actes: [
      { code: 'D700', libelle: 'Obturation de carie sur 1 face', dent: 'une', face: true, accord: false },
      { code: 'D701', libelle: 'Obturation de carie sur 2 faces', dent: 'une', face: true, accord: false },
      { code: 'D702', libelle: 'Obturation de carie complexe (3 faces ou plus)', dent: 'une', face: true, accord: false },
      { code: 'D703', libelle: 'Gangrène pulpaire, obturation monoradiculaire', dent: 'une', face: false, accord: false },
      { code: 'D704', libelle: 'Pulpectomie monoradiculaire (incisive, canine)', dent: 'une', face: false, accord: false },
      { code: 'D705', libelle: 'Pulpectomie biradiculaire (prémolaire)', dent: 'une', face: false, accord: false },
      { code: 'D706', libelle: 'Pulpectomie pluriradiculaire (molaire)', dent: 'une', face: false, accord: false },
    ],
  },
  {
    cle: 'parodonte',
    titre: 'Prévention et parodontologie',
    actes: [
      { code: 'D708', libelle: 'Détartrage complet et polissage (par séance)', dent: null, face: false, accord: false },
      { code: 'D719', libelle: 'Fluor topique / scellement de sillons (enfant)', dent: 'une', face: false, accord: false, famille: 'soins' },
      { code: 'D709', libelle: 'Attelle de contention parodontale (par bloc)', dent: 'bloc', face: false, accord: false },
      { code: 'D710', libelle: 'Traitement des parodontopathies (par quadrant)', dent: null, face: false, accord: false },
      { code: 'D711', libelle: 'Élongation coronaire chirurgicale', dent: 'une', face: false, accord: false },
      { code: 'D712', libelle: 'Gingivectomie ou plastie gingivale (bloc de 4 à 6 dents)', dent: 'bloc', face: false, accord: false },
      { code: 'D715', libelle: 'Greffe gingivale libre ou lambeau déplacé', dent: 'une', face: false, accord: true },
    ],
  },
  {
    cle: 'chirurgie',
    titre: 'Extractions et chirurgie buccale',
    actes: [
      { code: 'D713', libelle: 'Extraction d’une dent permanente', dent: 'une', face: false, accord: false, famille: 'extraction' },
      { code: 'D714', libelle: 'Extraction d’une dent temporaire (dent de lait)', dent: 'une', face: false, accord: false, famille: 'extraction' },
      { code: 'D720', libelle: 'Extraction d’une première dent de sagesse incluse', dent: 'une', face: false, accord: false, famille: 'extraction' },
      { code: 'D721', libelle: 'Dent de sagesse incluse supplémentaire (même séance)', dent: 'une', face: false, accord: false, famille: 'extraction' },
      { code: 'D722', libelle: 'Germectomie chirurgicale', dent: 'une', face: false, accord: false, famille: 'extraction' },
      { code: 'D725', libelle: 'Alvéolectomie / extraction chirurgicale par lambeau', dent: 'une', face: false, accord: false, famille: 'extraction' },
      { code: 'D726', libelle: 'Résection apicale (bout de racine)', dent: 'une', face: false, accord: false },
      { code: 'D728', libelle: 'Dégagement chirurgical d’une dent incluse (traction ODF)', dent: 'une', face: false, accord: false },
      { code: 'D730', libelle: 'Frénectomie ou frénotomie', dent: null, face: false, accord: false },
      { code: 'D732', libelle: 'Communication bucco-sinusienne post-extraction', dent: null, face: false, accord: false },
      { code: 'D733', libelle: 'Curetage apical / kyste radiculaire (monoradiculaire)', dent: 'une', face: false, accord: false },
      { code: 'D734', libelle: 'Curetage apical / kyste radiculaire (pluriradiculaire)', dent: 'une', face: false, accord: false },
      { code: 'D738', libelle: 'Séquestrectomie osseuse alvéolo-dentaire', dent: 'bloc', face: false, accord: false },
      { code: 'D740', libelle: 'Exérèse de kyste maxillaire ou tumeur bénigne', dent: null, face: false, accord: false },
      { code: 'D742', libelle: 'Drainage d’un abcès ou phlegmon', dent: null, face: false, accord: false },
      { code: 'D800', libelle: 'Réduction d’une luxation de la mâchoire', dent: null, face: false, accord: false },
      { code: 'D804', libelle: 'Suture de plaie de la langue ou du plancher', dent: null, face: false, accord: false },
      { code: 'D805', libelle: 'Suture de plaie de la lèvre ou de la joue', dent: null, face: false, accord: false },
      { code: 'D812', libelle: 'Contention de fracture alvéolo-dentaire', dent: null, face: false, accord: false },
      { code: 'D905', libelle: 'Hémostase post-opératoire au cabinet', dent: null, face: false, accord: false },
    ],
  },
  {
    cle: 'prothese',
    titre: 'Prothèses',
    actes: [
      { code: 'D754', libelle: 'Couronne céramo-métallique', dent: 'une', face: false, accord: false, famille: 'prothese_conjointe' },
      { code: 'D755', libelle: 'Inlay-core / pivot de reconstitution', dent: 'une', face: false, accord: false, famille: 'prothese_conjointe' },
      { code: 'D756', libelle: 'Élément de bridge céramo-métallique', dent: 'une', face: false, accord: false, famille: 'prothese_conjointe' },
      { code: 'D757', libelle: 'Couronne provisoire en résine', dent: 'une', face: false, accord: false, famille: 'prothese_conjointe', horsNomenclature: true },
      { code: 'D760', libelle: 'Facette esthétique en céramique', dent: 'une', face: false, accord: false, famille: 'prothese_conjointe', horsNomenclature: true },
      { code: 'D748', libelle: 'Prothèse adjointe résine, 1 à 3 dents', dent: null, face: false, accord: false, famille: 'prothese_adjointe' },
      { code: 'D750', libelle: 'Prothèse amovible complète (par maxillaire)', dent: null, face: false, accord: true, famille: 'prothese_adjointe' },
      { code: 'D752', libelle: 'Stellite (châssis métallique) — base forfaitaire', dent: null, face: false, accord: true, famille: 'prothese_adjointe' },
      { code: 'D749', libelle: 'Adjonction d’une dent ou d’un crochet (réparation)', dent: null, face: false, accord: false, famille: 'prothese_adjointe' },
      { code: 'D751', libelle: 'Rebasage complet d’une prothèse amovible', dent: null, face: false, accord: false, famille: 'prothese_adjointe' },
    ],
  },
  {
    cle: 'odf',
    titre: 'Orthodontie et radiographies',
    actes: [
      { code: 'D626', libelle: 'Traitement ODF actif, par semestre (moins de 16 ans)', dent: null, face: false, accord: true, famille: 'odf' },
      { code: 'D630', libelle: 'Forfait global de fin de traitement ODF', dent: null, face: false, accord: true, famille: 'odf' },
      { code: 'D635', libelle: 'Traitement chirurgico-orthodontique, canines incluses', dent: 'une', face: false, accord: true, famille: 'odf' },
      { code: 'T156', libelle: 'Radiographie rétro-alvéolaire (une)', dent: 'une', face: false, accord: false, famille: 'radio' },
      { code: 'T157', libelle: 'Deux rétro-alvéolaires dans la même séance', dent: 'une', face: false, accord: false, famille: 'radio' },
      { code: 'T159', libelle: 'Trois rétro-alvéolaires ou plus, même séance', dent: 'une', face: false, accord: false, famille: 'radio' },
    ],
  },
]

/** Tous les actes, à plat. */
export const ACTES_DENTAIRES: ActeDentaire[] = GROUPES_ACTES.flatMap((g) => g.actes)

const PAR_CODE = new Map(ACTES_DENTAIRES.map((a) => [a.code.toUpperCase(), a]))

/** L'acte que désigne un code, s'il est au catalogue. Tolère « d 704 ». */
export function acteParCode(code: string | null | undefined): ActeDentaire | null {
  const c = String(code ?? '').toUpperCase().replace(/\s+/g, '')
  return PAR_CODE.get(c) ?? null
}

/** Les actes dont le libellé ou le code contient la recherche. Insensible aux
 *  accents : un praticien pressé tape « gingivectomie » sans accent, ou
 *  « extraction sagesse » dans n'importe quel ordre. */
export function rechercherActes(q: string, max = 12): ActeDentaire[] {
  const mots = sansAccent(q).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return []
  return ACTES_DENTAIRES.filter((a) => {
    const foin = sansAccent(`${a.code} ${a.libelle}`)
    return mots.every((m) => foin.includes(m))
  }).slice(0, max)
}

function sansAccent(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Ce que l'acte exige et que la ligne n'a pas encore. Rendu en clair, pour
 *  être affiché tel quel. */
export function manquePourActe(
  code: string | null | undefined,
  dent: string | null | undefined,
): string | null {
  const a = acteParCode(code)
  if (!a || !a.dent) return null
  if (String(dent ?? '').trim()) return null
  return a.dent === 'bloc'
    ? 'le bloc de dents traité'
    : 'le numéro de la dent'
}
