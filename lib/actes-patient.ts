// LE REGISTRE DES ACTES DU DENTISTE — ce qui DÉCIDE, sans base ni écran.
//
// ── CE QUE LE PRATICIEN FAIT ────────────────────────────────────────────────
//
// Il touche les dents sur le schéma, il choisit « Ajouter un acte », il prend
// l'acte dans sa liste — le prix arrive tout seul, il peut le changer — et il
// dit où en est l'acte : à faire, en cours, fini, annulé. Tout ce qu'il a fait
// à ce patient se retrouve dans UNE liste, et une feuille de soins se compose
// en cochant des lignes de cette liste.
//
// Ce fichier porte les règles de ce geste : quel prix proposer, combien
// d'actes créer quand trois dents sont touchées, ce que l'acte change sur le
// schéma, ce qu'une ligne de devis accepté devient dans la liste. Il est testé
// (scripts/tests/actes-patient.test.mjs) : une erreur ici ne fait planter
// aucun écran, elle met un faux prix sur une feuille de soins.

import {
  ACTES_DENTAIRES, GROUPES_ACTES, cleActe, cotationDe, acteParCode,
  type ActeDentaire, type ExigenceDent,
} from '@/lib/actes-dentaires'
import { isValidTooth, type ToothFace, type ToothNature, type ToothStatus } from '@/lib/dental'

// ── STATUTS ─────────────────────────────────────────────────────────────────

export type StatutActe = 'a_faire' | 'en_cours' | 'fini' | 'annule'

export const STATUTS_ACTE: { cle: StatutActe; label: string; aide: string; pastille: string }[] = [
  { cle: 'a_faire',  label: 'À faire',  aide: 'Prévu, pas encore commencé', pastille: 'bg-amber-50 text-amber-800 border-amber-200' },
  { cle: 'en_cours', label: 'En cours', aide: 'Commencé, d’autres séances suivent', pastille: 'bg-sky-50 text-sky-800 border-sky-200' },
  { cle: 'fini',     label: 'Fini',     aide: 'Acte terminé', pastille: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { cle: 'annule',   label: 'Annulé',   aide: 'Ne sera pas fait', pastille: 'bg-gray-100 text-gray-500 border-gray-200' },
]

export const LIBELLE_STATUT: Record<StatutActe, string> =
  Object.fromEntries(STATUTS_ACTE.map((s) => [s.cle, s.label])) as Record<StatutActe, string>

export function estStatut(v: unknown): v is StatutActe {
  return typeof v === 'string' && STATUTS_ACTE.some((s) => s.cle === v)
}

// ── L'ACTE TEL QU'IL EST ENREGISTRÉ ─────────────────────────────────────────

export interface ActePatient {
  id: string
  patient_id: string
  appointment_id: string | null
  quote_item_id: string | null
  date_acte: string
  dents: string[]
  faces: string[]
  libelle: string
  code: string | null
  prix: number
  remarque: string | null
  statut: StatutActe
  care_sheet_id: string | null
  created_at: string
}

/** Les dents dans l'ordre où on les lit sur un schéma : 18 → 11, 21 → 28,
 *  48 → 41, 31 → 38 — et non dans l'ordre où elles ont été touchées. */
export function trierDents(dents: string[]): string[] {
  const rang = (d: string) => {
    const n = Number(d)
    const q = Math.floor(n / 10)
    const p = n % 10
    // Quadrants 1 et 5 se lisent de l'extérieur vers le milieu ; 2 et 6 du
    // milieu vers l'extérieur. Le bas suit le même sens, de 4 vers 3.
    const ordreQ: Record<number, number> = { 1: 0, 5: 1, 6: 2, 2: 3, 4: 4, 8: 5, 7: 6, 3: 7 }
    const versLeMilieu = q === 1 || q === 5 || q === 4 || q === 8
    return (ordreQ[q] ?? 9) * 100 + (versLeMilieu ? 10 - p : p)
  }
  return Array.from(new Set(dents)).sort((a, b) => rang(a) - rang(b))
}

/** « 14, 15, 16 » — ou « — » pour un acte sans dent. */
export function libelleDents(dents: string[]): string {
  return dents.length === 0 ? '—' : trierDents(dents).join(', ')
}

// ── LE CATALOGUE DU CABINET ─────────────────────────────────────────────────
//
// Le catalogue officiel (NGAP) est dans le code. Le cabinet n'enregistre que
// ce qu'il y CHANGE : son prix, un acte qu'il ne pratique pas, un acte à lui.

export interface TarifCabinet {
  id: string
  /** Clé de l'acte au catalogue NGAP (`cleActe`), ou null pour un acte propre
   *  au cabinet. */
  cle: string | null
  libelle: string
  prix: number | null
  actif: boolean
}

export interface ActeCatalogue {
  /** Clé unique dans le catalogue du cabinet : `cleActe` pour un acte NGAP,
   *  `perso:<id>` pour un acte du cabinet. */
  cle: string
  /** Code NGAP, ou null pour un acte hors nomenclature. */
  code: string | null
  libelle: string
  /** Famille d'affichage (« Soins conservateurs », « Vos actes »…). */
  groupe: string
  /** Le prix fixé par le cabinet dans ses réglages. */
  prixCabinet: number | null
  /** Le tarif national de référence (coefficient × valeur de la clé). */
  tnr: number | null
  /** L'acte porte-t-il sur une dent, un bloc, ou aucune ? */
  dent: ExigenceDent
  /** L'organisme exige-t-il la face ? */
  face: boolean
  /** Acte créé par le cabinet (hors catalogue). */
  perso: boolean
  /** Proposé dans « Ajouter un acte ». */
  actif: boolean
  /** L'identifiant de la ligne de réglage, quand il y en a une. */
  tarifId: string | null
}

export const GROUPE_PERSO = 'Vos actes'

/** Le catalogue tel que CE cabinet le voit : la NGAP avec ses prix et ses
 *  actes masqués, puis ses actes à lui. Les actes masqués sont gardés (avec
 *  `actif: false`) : les réglages doivent pouvoir les rendre. */
export function catalogueDuCabinet(tarifs: TarifCabinet[]): ActeCatalogue[] {
  const parCle = new Map<string, TarifCabinet>()
  for (const t of tarifs) if (t.cle) parCle.set(t.cle, t)

  const officiels: ActeCatalogue[] = GROUPES_ACTES.flatMap((g) => g.actes.map((a) => {
    const cle = cleActe(a)
    const t = parCle.get(cle)
    return {
      cle,
      code: a.code,
      libelle: a.libelle,
      groupe: g.titre,
      prixCabinet: t?.prix ?? null,
      tnr: cotationDe(a.code)?.tnr ?? null,
      dent: a.dent,
      face: a.face,
      perso: false,
      actif: t ? t.actif : true,
      tarifId: t?.id ?? null,
    }
  }))

  const perso: ActeCatalogue[] = tarifs
    .filter((t) => !t.cle)
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
    .map((t) => ({
      cle: `perso:${t.id}`,
      code: null,
      libelle: t.libelle,
      groupe: GROUPE_PERSO,
      prixCabinet: t.prix,
      tnr: null,
      // Un acte du cabinet est presque toujours un soin sur une dent
      // (implant, facette, blanchiment d'une dent…) ; s'il n'en a pas, le
      // praticien n'en coche aucune.
      dent: 'une',
      face: false,
      perso: true,
      actif: t.actif,
      tarifId: t.id,
    }))

  return [...perso, ...officiels]
}

function sansAccent(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ')
}

/** La clé de mémoire d'un prix : le code NGAP quand l'acte en a un (deux
 *  libellés voisins portent le même code et le même prix), sinon le libellé. */
export function clePrix(code: string | null | undefined, libelle: string): string {
  const c = String(code ?? '').toUpperCase().replace(/\s+/g, '')
  return c ? `code:${c}` : `lib:${sansAccent(libelle).replace(/\s+/g, ' ').trim()}`
}

export type SourcePrix = 'cabinet' | 'dernier' | 'reference'

/** Le prix à proposer pour un acte : celui que le cabinet a fixé, sinon le
 *  dernier qu'il a pratiqué, sinon le tarif national de référence. Toujours
 *  modifiable : c'est une proposition, pas un tarif imposé. */
export function prixPropose(
  acte: Pick<ActeCatalogue, 'code' | 'libelle' | 'prixCabinet' | 'tnr'>,
  derniers: Record<string, number>,
): { prix: number | null; source: SourcePrix | null } {
  if (acte.prixCabinet != null) return { prix: acte.prixCabinet, source: 'cabinet' }
  const dernier = derniers[clePrix(acte.code, acte.libelle)]
  if (dernier != null) return { prix: dernier, source: 'dernier' }
  if (acte.tnr != null) return { prix: acte.tnr, source: 'reference' }
  return { prix: null, source: null }
}

export const LIBELLE_SOURCE_PRIX: Record<SourcePrix, string> = {
  cabinet: 'votre tarif',
  dernier: 'dernier prix pratiqué',
  reference: 'tarif de référence AMO',
}

/** La mémoire des derniers prix, depuis les actes déjà enregistrés (du plus
 *  récent au plus ancien : le premier vu l'emporte). Les actes annulés n'y
 *  comptent pas — leur prix n'a jamais été demandé. */
export function derniersPrix(actes: Pick<ActePatient, 'code' | 'libelle' | 'prix' | 'statut'>[]): Record<string, number> {
  const memo: Record<string, number> = {}
  for (const a of actes) {
    if (a.statut === 'annule' || !(a.prix > 0)) continue
    const k = clePrix(a.code, a.libelle)
    if (!(k in memo)) memo[k] = a.prix
  }
  return memo
}

/** Recherche insensible aux accents et à l'ordre des mots, sur le code et le
 *  libellé. Sans recherche : tout le catalogue actif. */
export function filtrerCatalogue(catalogue: ActeCatalogue[], q: string): ActeCatalogue[] {
  const actifs = catalogue.filter((a) => a.actif)
  const mots = sansAccent(q).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return actifs
  return actifs.filter((a) => {
    const foin = sansAccent(`${a.code ?? ''} ${a.libelle}`)
    return mots.every((m) => foin.includes(m))
  })
}

// ── UN ACTE, OU UN PAR DENT ─────────────────────────────────────────────────
//
// Une obturation sur trois dents, ce sont trois obturations : trois lignes de
// feuille de soins, trois prix. Un traitement ODF ou une prothèse sur un bloc
// de dents, c'est UN acte qui couvre plusieurs dents. La NGAP le dit pour
// chaque acte (`dent: 'une' | 'bloc' | null`).

/** Comment répartir les dents touchées entre les actes à créer. Un tableau
 *  par acte ; un tableau vide = un acte sans dent. */
export function repartirDents(exigence: ExigenceDent | undefined, dents: string[]): string[][] {
  const triees = trierDents(dents)
  if (exigence === 'une' && triees.length > 1) return triees.map((d) => [d])
  return [triees]
}

// ── CE QUE L'ACTE CHANGE SUR LE SCHÉMA ──────────────────────────────────────
//
// Une obturation finie sur la 46 doit se VOIR sur la 46 : le schéma et la
// liste racontent la même histoire. Un acte prévu se dessine « à faire »
// (contour en tirets), un acte fini « réalisé ». Un acte annulé ne touche à
// rien — c'est au praticien de dire ce que devient la dent.

export interface EtatsDeLActe {
  /** L'état posé quand l'acte est fini. */
  fini: ToothStatus
  /** L'état posé tant qu'il est à faire ou en cours (une extraction prévue
   *  n'est pas une dent absente : c'est une dent « à extraire »). */
  prevu: ToothStatus
}

const PAR_CODE: Record<string, ToothStatus> = {
  D700: 'obturation', D701: 'obturation', D702: 'obturation', D707: 'obturation',
  D703: 'endodontie', D704: 'endodontie', D705: 'endodontie', D706: 'endodontie',
  D712: 'scellement',
  D713: 'extraite', D714: 'extraite', D715: 'extraite', D716: 'extraite', D717: 'extraite',
  D720: 'extraite', D721: 'extraite', D724: 'extraite', D725: 'extraite', D726: 'extraite', D727: 'extraite',
  D748: 'couronne', D749: 'couronne', D750: 'couronne', D751: 'couronne', D752: 'couronne',
  D753: 'couronne', D754: 'couronne', D755: 'couronne', D756: 'couronne', D760: 'couronne',
  D757: 'bridge',
  D773: 'prothese_amovible', D774: 'prothese_amovible',
}
for (let n = 761; n <= 772; n++) PAR_CODE[`D${n}`] = 'prothese_amovible'

/** Pour un acte hors nomenclature, le libellé décide. L'ordre compte :
 *  « couronne sur implant » est d'abord un implant. */
const PAR_MOT: [RegExp, ToothStatus][] = [
  [/implant/, 'implant'],
  [/facette/, 'facette'],
  [/inlay|onlay/, 'inlay'],
  [/bridge/, 'bridge'],
  [/couronne|jacket|coiffe/, 'couronne'],
  [/canalaire|devitalis|depulp|pulpectomie|pulpotomie|endodont/, 'endodontie'],
  [/extraction|avulsion|germectomie/, 'extraite'],
  [/scellement|sillon/, 'scellement'],
  [/obturation|composite|amalgame|reconstitution|plombage/, 'obturation'],
  [/prothese (amovible|adjointe|totale|partielle)|stellite/, 'prothese_amovible'],
]

/** Les états du schéma qu'un acte pose. Null quand l'acte ne se dessine pas
 *  sur une dent (consultation, détartrage, ODF…). */
export function etatsDeLActe(code: string | null | undefined, libelle: string): EtatsDeLActe | null {
  const c = String(code ?? '').toUpperCase().replace(/\s+/g, '')
  let fini: ToothStatus | null = c ? PAR_CODE[c] ?? null : null
  // Un acte ASSIMILÉ emprunte le code d'un autre : on ne se fie pas au code
  // quand le libellé ne dit pas la même chose (D710 « réimplantation »).
  if (fini && c && acteParCode(c) && /assimil/i.test(libelle)) fini = null
  if (!fini && !(c && acteParCode(c))) {
    const l = sansAccent(libelle)
    for (const [re, etat] of PAR_MOT) if (re.test(l)) { fini = etat; break }
  }
  if (!fini) return null
  return { fini, prevu: fini === 'extraite' ? 'a_extraire' : fini }
}

export interface ChangementSchema {
  dent: string
  etat: ToothStatus
  nature: ToothNature
  faces: ToothFace[]
}

const FACES_VALIDES = new Set(['M', 'O', 'D', 'V', 'P'])

/** Ce que le schéma doit montrer après cet acte. Vide si l'acte est annulé,
 *  sans dent, ou ne se dessine pas. */
export function changementsSchema(acte: {
  code: string | null; libelle: string; statut: StatutActe; dents: string[]; faces?: string[]
}): ChangementSchema[] {
  if (acte.statut === 'annule' || acte.dents.length === 0) return []
  const etats = etatsDeLActe(acte.code, acte.libelle)
  if (!etats) return []
  const fini = acte.statut === 'fini'
  const etat = fini ? etats.fini : etats.prevu
  const faces = (acte.faces ?? []).filter((f): f is ToothFace => FACES_VALIDES.has(f))
  // Les faces n'ont de sens que pour une obturation, un inlay, une carie… :
  // sur une couronne ou une dent extraite, elles seraient ignorées par le
  // dessin ; on ne les écrit donc pas.
  const avecFaces = etat === 'obturation' || etat === 'inlay' || etat === 'facette' || etat === 'scellement'
  return trierDents(acte.dents).map((dent) => ({
    dent,
    etat,
    nature: fini ? 'realise' : 'planifie',
    faces: avecFaces ? faces : [],
  }))
}

// ── LA SAISIE, VÉRIFIÉE ─────────────────────────────────────────────────────

export interface SaisieActe {
  date_acte: string
  dents: string[]
  faces: string[]
  libelle: string
  code: string | null
  prix: number
  remarque: string | null
  statut: StatutActe
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Vérifie ce que le navigateur envoie. Champs absents tolérés seulement en
 *  modification (`partiel`). Le message d'erreur se lit tel quel. */
export function verifierSaisie(
  brut: Record<string, unknown>,
  partiel = false,
): { ok: true; valeur: Partial<SaisieActe> } | { ok: false; erreur: string } {
  const v: Partial<SaisieActe> = {}

  if (brut.libelle !== undefined || !partiel) {
    const libelle = String(brut.libelle ?? '').replace(/\s+/g, ' ').trim()
    if (!libelle) return { ok: false, erreur: 'Choisissez un acte.' }
    if (libelle.length > 200) return { ok: false, erreur: 'Libellé trop long (200 caractères au plus).' }
    v.libelle = libelle
  }
  if (brut.code !== undefined) {
    const code = String(brut.code ?? '').toUpperCase().replace(/\s+/g, '')
    if (code.length > 20) return { ok: false, erreur: 'Code trop long.' }
    v.code = code || null
  }
  if (brut.date_acte !== undefined || !partiel) {
    const date = String(brut.date_acte ?? '')
    if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
      return { ok: false, erreur: 'Date invalide.' }
    }
    v.date_acte = date
  }
  if (brut.dents !== undefined || !partiel) {
    const liste = Array.isArray(brut.dents) ? brut.dents.map((d) => String(d).trim()).filter(Boolean) : []
    if (liste.length > 32) return { ok: false, erreur: 'Trop de dents.' }
    const fausse = liste.find((d) => !isValidTooth(d))
    if (fausse) return { ok: false, erreur: `Numéro de dent invalide : ${fausse}.` }
    v.dents = trierDents(liste)
  }
  if (brut.faces !== undefined) {
    const faces = Array.isArray(brut.faces) ? brut.faces.map((f) => String(f).toUpperCase()) : []
    if (faces.some((f) => !FACES_VALIDES.has(f))) return { ok: false, erreur: 'Face invalide.' }
    v.faces = Array.from(new Set(faces))
  }
  if (brut.prix !== undefined || !partiel) {
    const prix = Number(String(brut.prix ?? '').replace(',', '.'))
    if (!Number.isFinite(prix) || prix < 0 || prix > 1000000) return { ok: false, erreur: 'Prix invalide.' }
    v.prix = Math.round(prix * 100) / 100
  }
  if (brut.remarque !== undefined) {
    const r = String(brut.remarque ?? '').trim()
    if (r.length > 1000) return { ok: false, erreur: 'Remarque trop longue (1000 caractères au plus).' }
    v.remarque = r || null
  }
  if (brut.statut !== undefined || !partiel) {
    if (!estStatut(brut.statut)) return { ok: false, erreur: 'Statut invalide.' }
    v.statut = brut.statut
  }
  return { ok: true, valeur: v }
}

// ── LE PLAN DE TRAITEMENT DANS LA LISTE ─────────────────────────────────────

export interface LigneDevisLue {
  id: string
  tooth: string | null
  label: string
  unit_price: number
  quantity: number
  done: boolean
  done_at: string | null
  appointment_id: string | null
  created_at?: string | null
}

/** Le code NGAP d'un libellé de devis, quand c'est mot pour mot celui du
 *  catalogue. Jamais deviné au-delà : un code faux part sur une feuille. */
export function codeDuLibelleDevis(label: string): string | null {
  const l = sansAccent(label).replace(/\s+/g, ' ').trim()
  const a = ACTES_DENTAIRES.find((x) => !x.assimile && sansAccent(x.libelle).replace(/\s+/g, ' ').trim() === l)
  return a?.code ?? null
}

/** L'acte qu'une ligne de devis ACCEPTÉ devient dans la liste. */
export function acteDepuisLigneDevis(
  ligne: LigneDevisLue,
  devis: { accepted_at: string | null; created_at: string | null },
): Omit<SaisieActe, 'faces'> & { quote_item_id: string; appointment_id: string | null; faces: string[] } {
  const jour = (ligne.done ? ligne.done_at : null) ?? devis.accepted_at ?? ligne.created_at ?? devis.created_at ?? ''
  const tooth = String(ligne.tooth ?? '').trim()
  return {
    quote_item_id: ligne.id,
    appointment_id: ligne.done ? ligne.appointment_id : null,
    date_acte: jour.slice(0, 10) || new Date().toISOString().slice(0, 10),
    dents: tooth && isValidTooth(tooth) ? [tooth] : [],
    faces: [],
    libelle: ligne.label.trim().slice(0, 200) || 'Acte du plan de traitement',
    code: codeDuLibelleDevis(ligne.label),
    prix: Math.round(Number(ligne.unit_price) * (ligne.quantity || 1) * 100) / 100,
    remarque: null,
    statut: ligne.done ? 'fini' : 'a_faire',
  }
}

/** Les devis dont les lignes entrent dans la liste : ceux que le patient a
 *  acceptés, et ceux dont tout est fait. Un brouillon ou une proposition
 *  n'engage encore personne. */
export const STATUTS_DEVIS_ENGAGES = ['accepte', 'termine'] as const

// ── LES TOTAUX ──────────────────────────────────────────────────────────────

export function totauxActes(actes: Pick<ActePatient, 'prix' | 'statut'>[]): Record<StatutActe, { n: number; montant: number }> {
  const t = Object.fromEntries(STATUTS_ACTE.map((s) => [s.cle, { n: 0, montant: 0 }])) as Record<StatutActe, { n: number; montant: number }>
  for (const a of actes) {
    t[a.statut].n += 1
    t[a.statut].montant = Math.round((t[a.statut].montant + Number(a.prix || 0)) * 100) / 100
  }
  return t
}

/** L'acte du catalogue NGAP correspondant à une clé de catalogue cabinet. */
export function acteOfficiel(cle: string): ActeDentaire | null {
  if (cle.startsWith('perso:')) return null
  return ACTES_DENTAIRES.find((a) => cleActe(a) === cle) ?? null
}
