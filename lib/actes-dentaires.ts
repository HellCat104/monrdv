// Le catalogue des actes dentaires cotés — ce que le praticien COCHE.
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
//
// Le praticien ne tape pas de code : il coche ce qu'il a fait, et la ligne de
// la feuille de soins arrive PRÊTE — code, lettre clé, coefficient, valeur de
// la clé, montant. C'est ce que demandent les imprimés de l'AMO (CNSS, CNOPS,
// mutuelles) : « Code des actes », « Lettre clé – Cotation NGAP », « Valeur
// clé », « Montant facturé ».
//
// ── D'OÙ VIENNENT LES CHIFFRES (novembre 2026) ──────────────────────────────
//
// CODES ET COEFFICIENTS — la Nomenclature Générale des Actes Professionnels
// (NGAP) du Maroc, chapitre VII « Dents, gencives » (codes D700 à D785) et
// l'article 5 « Orthopédie dento-faciale » (D626 à D641). Chaque ligne
// ci-dessous reprend le numéro, l'intitulé et le coefficient du texte, sans
// interprétation.
//
// VALEUR DE LA LETTRE CLÉ D — Convention nationale AMO organismes
// gestionnaires / chirurgiens-dentistes du 28 juillet 2006, titre II :
//   • D pour les soins dentaires     : 17,50 DH
//   • D pour les prothèses dentaires : 12,50 DH
//   • ODF : forfait de 1 500 DH par semestre
// Une revalorisation de la TNR est en discussion depuis 2026 ; tant qu'elle
// n'est pas publiée, ce sont ces valeurs qui s'appliquent. Les changer ici
// suffit : tout le reste en découle.
//
// Le tarif de référence d'un acte est le PRODUIT coefficient × valeur de la
// clé (NGAP, dispositions générales). Le MONTANT FACTURÉ, lui, est ce que le
// cabinet demande réellement : il peut dépasser la TNR, et c'est le dernier
// montant pratiqué par le cabinet qui est proposé en priorité.
//
// ── L'ANCIEN CATALOGUE ──────────────────────────────────────────────────────
//
// La première version de ce fichier venait d'un dossier technique, pas du
// texte officiel. Relu contre la NGAP, une trentaine de libellés ne
// correspondaient pas à leur code (D714 n'est pas la dent de lait mais
// l'extraction suivante, D755 n'est pas un inlay-core mais une couronne
// jacket, D748 à D752 sont des couronnes et non des prothèses amovibles…).
// Une feuille cochée « dent de lait » partait avec le code d'un autre acte.
// Ce catalogue est désormais le texte officiel, et rien d'autre.
//
// Ce qui n'est pas à la nomenclature (implant, blanchiment, facette
// céramique, couronne provisoire) n'a pas de code : le praticien l'ajoute en
// ligne libre, et l'organisme ne le rembourse pas.

/** La dent concernée par l'acte : une seule, un bloc, ou aucune. */
export type ExigenceDent = 'une' | 'bloc' | null

/** Valeurs de la lettre clé D — convention AMO du 28 juillet 2006. */
export const VALEUR_D_SOINS = 17.5
export const VALEUR_D_PROTHESE = 12.5
/** Forfait ODF, par semestre de traitement. */
export const FORFAIT_ODF_SEMESTRE = 1500

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
  /** À quelle famille l'acte appartient. Sert aux imprimés qui séparent les
   *  prothèses des soins, et à la valeur de la clé. */
  famille?: 'soins' | 'prothese_conjointe' | 'prothese_adjointe' | 'odf' | 'extraction' | 'radio'
  /** Pourquoi ce code demande une vérification. Renseigné, l'acte est signalé
   *  partout où il apparaît — à la saisie et avant l'impression. */
  aVerifier?: string
  /** La lettre clé NGAP : D pour le chirurgien-dentiste, C pour la
   *  consultation, V pour la visite. */
  lettre: 'D' | 'C' | 'V'
  /** Le coefficient NGAP. Absent pour la consultation, dont la valeur ne
   *  dépend pas d'un coefficient. */
  coefficient?: number
  /** Une précision réglementaire à afficher à côté de l'acte (radio
   *  obligatoire, majoration enfant, limite d'âge…). */
  note?: string
}

export interface GroupeActes {
  cle: string
  titre: string
  actes: ActeDentaire[]
}

const soin = (code: string, libelle: string, coefficient: number, autres: Partial<ActeDentaire> = {}): ActeDentaire => ({
  code, libelle, coefficient, lettre: 'D', dent: 'une', face: false, accord: false, famille: 'soins', ...autres,
})
const extraction = (code: string, libelle: string, coefficient: number, autres: Partial<ActeDentaire> = {}): ActeDentaire =>
  soin(code, libelle, coefficient, { famille: 'extraction', ...autres })
const conjointe = (code: string, libelle: string, coefficient: number, autres: Partial<ActeDentaire> = {}): ActeDentaire =>
  soin(code, libelle, coefficient, { famille: 'prothese_conjointe', ...autres })
const adjointe = (code: string, libelle: string, coefficient: number, autres: Partial<ActeDentaire> = {}): ActeDentaire =>
  soin(code, libelle, coefficient, { famille: 'prothese_adjointe', dent: null, ...autres })
const odf = (code: string, libelle: string, coefficient: number, autres: Partial<ActeDentaire> = {}): ActeDentaire =>
  soin(code, libelle, coefficient, { famille: 'odf', dent: null, ...autres })

const RADIO_PRE_OP = 'Radiographie pré-opératoire obligatoire.'
const RADIOS_ENDO = 'Radiographies pré- et post-opératoires obligatoires. +50 % sur dent permanente avant 13 ans.'

/** Appareils sur plaque résine, d'une à quatorze dents : D761 à D772. */
const PLAQUES: ActeDentaire[] = ([
  ['D761', '1 à 3 dents', 40], ['D762', '4 dents', 45], ['D763', '5 dents', 50], ['D764', '6 dents', 55],
  ['D765', '7 dents', 60], ['D766', '8 dents', 65], ['D767', '9 dents', 70], ['D768', '10 dents', 75],
  ['D769', '11 dents', 80], ['D770', '12 dents', 85], ['D771', '13 dents', 90], ['D772', '14 dents', 95],
] as const).map(([code, n, coef]) => adjointe(code, `Prothèse amovible résine — ${n}`, coef))

export const GROUPES_ACTES: GroupeActes[] = [
  {
    cle: 'urgence',
    titre: 'Consultations et urgences',
    actes: [
      { code: 'C', libelle: 'Consultation au cabinet', lettre: 'C', dent: null, face: false, accord: false },
      { code: 'V', libelle: 'Visite au domicile du malade', lettre: 'V', dent: null, face: false, accord: false },
      soin('D703', 'Pulpotomie / pulpectomie coronaire (urgence, chambre pulpaire)', 7, { note: RADIOS_ENDO }),
      extraction('D744', 'Hémorragie post-opératoire (autre séance que l’intervention)', 10, { dent: null }),
    ],
  },
  {
    cle: 'conservateur',
    titre: 'Soins conservateurs et endodontie',
    actes: [
      soin('D700', 'Obturation — cavité simple (1 face)', 10, { face: true }),
      soin('D701', 'Obturation — cavité composée, 2 faces', 10, { face: true }),
      soin('D702', 'Obturation — cavité composée, 3 faces et plus', 15, { face: true }),
      soin('D704', 'Traitement canalaire — incisive, canine', 10, { note: RADIOS_ENDO }),
      soin('D705', 'Traitement canalaire — prémolaire', 15, { note: RADIOS_ENDO }),
      soin('D706', 'Traitement canalaire — molaire', 25, { note: RADIOS_ENDO }),
      soin('D707', 'Reconstitution 2 faces et plus avec ancrage radiculaire', 33, { face: true }),
    ],
  },
  {
    cle: 'parodonte',
    titre: 'Prévention et parodontologie',
    actes: [
      soin('D708', 'Détartrage complet sus et sous-gingival (par séance, 2 max.)', 12, { dent: null }),
      soin('D712', 'Scellement prophylactique des sillons (par dent)', 8, { note: '1re et 2e molaires permanentes, une fois par dent, jusqu’à 14 ans.' }),
      soin('D709', 'Ligature métallique (parodontopathie)', 8, { dent: 'bloc' }),
      soin('D710', 'Attelle métallique (parodontopathie)', 40, { dent: 'bloc' }),
      soin('D711', 'Prothèse attelle de contention', 70, { dent: 'bloc' }),
      soin('D742', 'Gingivectomie partielle', 5),
      soin('D743', 'Gingivectomie étendue à un sextant', 20, { dent: 'bloc' }),
    ],
  },
  {
    cle: 'chirurgie',
    titre: 'Extractions et chirurgie buccale',
    actes: [
      extraction('D713', 'Extraction d’une dent permanente', 10),
      extraction('D714', 'Extraction — chacune des suivantes (même séance)', 5),
      extraction('D715', 'Extraction d’une dent de lait', 8),
      extraction('D716', 'Extraction dent de lait — chacune des suivantes (même séance)', 4),
      extraction('D717', 'Extraction par alvéolectomie', 10),
      extraction('D720', 'Dent de sagesse incluse — la première', 40, { note: RADIO_PRE_OP }),
      extraction('D721', 'Dent de sagesse incluse — chacune des suivantes', 20, { note: RADIO_PRE_OP }),
      extraction('D724', 'Germectomie (autre que dent de sagesse)', 20, { note: RADIO_PRE_OP }),
      extraction('D725', 'Extraction d’une dent incluse ou enclavée', 40, { note: RADIO_PRE_OP }),
      extraction('D726', 'Extraction d’une canine incluse', 50, { note: RADIO_PRE_OP }),
      extraction('D727', 'Extraction d’une dent surnuméraire incluse', 40, { note: RADIO_PRE_OP }),
      extraction('D734', 'Dégagement chirurgical de la couronne d’une dent incluse', 30),
      extraction('D738', 'Curetage périapical / résection apicale', 15, { note: 'Radiographie obligatoire ; traitement du canal non compris.' }),
      extraction('D739', 'Kyste de petit volume (voie alvéolaire)', 15, { note: 'Radiographie obligatoire.' }),
      extraction('D740', 'Kyste étendu aux apex de deux dents', 30, { note: 'Radiographie obligatoire.' }),
      extraction('D735', 'Régularisation de crête localisée (autre séance)', 5, { dent: 'bloc' }),
      extraction('D736', 'Régularisation de crête — hémi-maxillaire ou canine à canine', 15, { dent: 'bloc' }),
      extraction('D737', 'Régularisation de crête — totalité', 30, { dent: null }),
      extraction('D733', 'Trépanation du sinus pour recherche d’une racine', 40),
    ],
  },
  {
    cle: 'prothese',
    titre: 'Prothèses',
    actes: [
      conjointe('D754', 'Couronne céramo-métal', 180),
      conjointe('D757', 'Élément de bridge (compté comme couronne céramo-métal)', 180, {
        note: 'Chaque élément se cote comme une couronne de même nature : changez le coefficient si le bridge n’est pas céramo-métal.',
      }),
      conjointe('D755', 'Couronne jacket céramo-métal', 180),
      conjointe('D756', 'Couronne jacket cuite', 40),
      conjointe('D750', 'Couronne coulée acier / nickel-chrome', 50),
      conjointe('D751', 'Couronne coulée or / métaux précieux', 80),
      conjointe('D748', 'Couronne ajustée acier / nickel-chrome', 40),
      conjointe('D749', 'Couronne ajustée or / métaux précieux', 60),
      conjointe('D752', 'Couronne à incrustation vestibulaire (veneer) acier', 75),
      conjointe('D753', 'Couronne à incrustation vestibulaire or', 120),
      conjointe('D758', 'Inlay-core or — dent à une racine', 80),
      conjointe('D759', 'Inlay-core or — dent à plusieurs racines', 100),
      conjointe('D760', 'Dent à pivot esthétique (or)', 150),
      ...PLAQUES,
      adjointe('D773', 'Prothèse totale — maxillaire supérieur', 120),
      adjointe('D774', 'Prothèse totale — maxillaire inférieur', 120),
      adjointe('D775', 'Supplément plaque base métallique', 120),
      adjointe('D776', 'Supplément dent contreplaquée sur plaque résine', 10),
      adjointe('D777', 'Supplément dent contreplaquée sur plaque métallique', 15),
      adjointe('D785', 'Attachement (en supplément de la plaque métallique)', 40),
      adjointe('D778', 'Réparation — fracture de plaque résine', 10),
      adjointe('D779', 'Réparation — fracture de plaque métallique', 15),
      adjointe('D780', 'Dent ou crochet ajouté / remplacé — premier élément', 10),
      adjointe('D781', 'Dent ou crochet ajouté / remplacé — chacun des suivants', 5),
      adjointe('D782', 'Dent ou crochet soudé sur appareil métallique (par élément)', 20),
      adjointe('D784', 'Remplacement de facette', 8),
    ],
  },
  {
    cle: 'odf',
    titre: 'Orthodontie',
    actes: [
      odf('D626', 'Examen ODF avec empreintes et diagnostic', 15),
      odf('D627', 'Analyse céphalométrique (en supplément)', 5),
      odf('D629', 'Traitement ODF — par semestre', 90, { accord: true, note: 'Forfait AMO : 1 500 DH par semestre.' }),
      odf('D631', 'Séance de surveillance (interruption du traitement)', 5, { accord: true }),
      odf('D636', 'Contention — première année', 75, { accord: true }),
      odf('D637', 'Contention — deuxième année', 50, { accord: true }),
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

export interface Cotation {
  lettreCle: string
  coefficient: number | null
  valeurCle: number | null
  /** Tarif national de référence : coefficient × valeur de la clé, ou le
   *  forfait. Null quand on ne le connaît pas (consultation). */
  tnr: number | null
}

/** La valeur de la lettre clé D pour un acte : prothèse ou soins. */
export function valeurCleDe(a: ActeDentaire): number | null {
  if (a.lettre !== 'D') return null
  if (a.famille === 'odf') return null // forfait, pas une valeur de clé
  return a.famille === 'prothese_conjointe' || a.famille === 'prothese_adjointe'
    ? VALEUR_D_PROTHESE
    : VALEUR_D_SOINS
}

/** Ce que l'imprimé demande pour un code du catalogue : lettre clé,
 *  coefficient, valeur de la clé, et le tarif de référence qui en découle.
 *  Null pour un code inconnu — on ne devine jamais une cotation. */
export function cotationDe(code: string | null | undefined): Cotation | null {
  const a = acteParCode(code)
  if (!a) return null
  const valeurCle = valeurCleDe(a)
  const coefficient = a.coefficient ?? null
  const tnr = a.code === 'D629'
    ? FORFAIT_ODF_SEMESTRE
    : coefficient != null && valeurCle != null ? Math.round(coefficient * valeurCle * 100) / 100 : null
  return { lettreCle: a.lettre, coefficient, valeurCle, tnr }
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

/** Le traitement canalaire qui convient à une dent : incisive et canine
 *  D704, prémolaire D705, molaire D706 (dents de lait : leurs positions 4 et
 *  5 sont des molaires). */
export function canalairePourDent(fdi: string | null | undefined): string {
  const n = Number(String(fdi ?? '').trim())
  const position = n % 10
  const lait = Math.floor(n / 10) >= 5
  if (!position) return 'D706'
  if (position <= 3) return 'D704'
  if (!lait && position <= 5) return 'D705'
  return 'D706'
}
