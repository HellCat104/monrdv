// Schéma dentaire (odontogramme) — constantes partagées entre l'UI et l'export.
// Notation FDI (internationale) : chaque dent porte un numéro à 2 chiffres.

export type ToothStatus =
  | 'carie' | 'obturation' | 'couronne' | 'a_extraire' | 'extraite' | 'implant'
  | 'fracture' | 'bridge' | 'endodontie' | 'mobilite'

// ── LES QUATRE NATURES ──────────────────────────────────────────────────────
//
// « Carie sur la 46 » et « obturation prévue sur la 46 » ne disent pas la même
// chose, et « obturation faite » encore moins. Confondus en un seul état, le
// plan de traitement devenait indiscernable du travail accompli : on ne savait
// plus ce qui restait à faire, ni ce qui avait été facturé.
//
// Chaque état porte donc sa nature. ABSENTE = « constaté » : c'est ce que
// voulaient dire toutes les lignes écrites avant cette version, et aucune
// donnée n'est réécrite.
export type ToothNature = 'constate' | 'diagnostic' | 'planifie' | 'realise'

export const DENTAL_NATURES: { key: ToothNature; label: string; aide: string }[] = [
  { key: 'constate',   label: 'Constaté',   aide: 'Ce que je vois aujourd’hui' },
  { key: 'diagnostic', label: 'Diagnostic', aide: 'Ce que j’en conclus' },
  { key: 'planifie',   label: 'À faire',    aide: 'Soin prévu, pas encore réalisé' },
  { key: 'realise',    label: 'Réalisé',    aide: 'Soin effectué' },
]

export const NATURE_LABEL: Record<string, string> =
  Object.fromEntries(DENTAL_NATURES.map((n) => [n.key, n.label]))

/** La nature d'un état, « constaté » par défaut : c'est le sens qu'avaient les
 *  lignes écrites avant que les natures existent. */
export function natureDe(info: ToothInfo | undefined, etat: ToothStatus): ToothNature {
  const n = info?.p?.[etat]
  return n && DENTAL_NATURES.some((x) => x.key === n) ? n : 'constate'
}

// Une dent porte PLUSIEURS états simultanés : une couronne peut se carier, une dent
// obturée peut devenir à extraire. Format écrit en base (jsonb) :
//   { "16": { "s": ["couronne", "carie"], "n": "à surveiller" } }
//
// LES FACES (`f`)
//
// Un dentiste ne note pas « carie sur la 16 », il note « carie occlusale, et
// composite mésial ». La face appartient donc à l'ÉTAT, pas à la dent : une
// même dent peut porter une carie sur une face et une obturation sur une autre.
//   { "16": { "s": ["carie", "obturation"], "f": { "carie": ["O"], "obturation": ["M"] } } }
// `f` absent ou vide = l'état porte sur la dent entière, ce qui reste le cas de
// la couronne, de l'implant ou d'une dent absente. C'est aussi l'état de toutes
// les lignes écrites avant cette version : rien à migrer.
export interface ToothInfo {
  s: ToothStatus[]
  n?: string
  f?: Partial<Record<ToothStatus, ToothFace[]>>
  /** Nature de chaque état (voir ToothNature). Clé absente = « constaté ». */
  p?: Partial<Record<ToothStatus, ToothNature>>
  /** Date à laquelle l'état a été posé, par état. Format YYYY-MM-DD. */
  d?: Partial<Record<ToothStatus, string>>
}
export type DentalTeeth = Record<string, ToothInfo>

// Ancien format, antérieur aux états multiples : { "16": { "s": "carie" } }.
// Les lignes déjà en base restent telles quelles (pas de migration SQL, on ne
// réécrit aucune donnée existante). Conséquence : TOUTE lecture doit passer par
// normalizeTeeth() / toothStates(), qui acceptent la chaîne comme le tableau.
export interface StoredToothInfo {
  s?: ToothStatus | ToothStatus[] | null
  n?: string | null
  f?: Record<string, unknown> | null
}
export type StoredDentalTeeth = Record<string, StoredToothInfo | null | undefined>

export const DENTAL_STATES: { key: ToothStatus; label: string; color: string }[] = [
  { key: 'carie',      label: 'Carie',                 color: '#ef4444' },
  { key: 'fracture',   label: 'Fracture',              color: '#dc2626' },
  { key: 'mobilite',   label: 'Mobilité',              color: '#ea580c' },
  { key: 'obturation', label: 'Plombage / obturation', color: '#3b82f6' },
  { key: 'endodontie', label: 'Traitement de racine',  color: '#0ea5e9' },
  { key: 'couronne',   label: 'Couronne',              color: '#f59e0b' },
  { key: 'bridge',     label: 'Bridge',                color: '#d97706' },
  { key: 'a_extraire', label: 'À extraire',            color: '#f97316' },
  { key: 'extraite',   label: 'Absente / extraite',    color: '#6b7280' },
  { key: 'implant',    label: 'Implant',               color: '#8b5cf6' },
]
// Les cinq faces d'une dent, dans l'ordre où un praticien les lit sur un schéma.
// Les initiales sont celles qu'il écrit déjà à la main sur ses fiches.
export type ToothFace = 'M' | 'O' | 'D' | 'V' | 'P'

export const DENTAL_FACES: { key: ToothFace; label: string; aide: string }[] = [
  { key: 'M', label: 'M', aide: 'Mésiale (vers le milieu)' },
  { key: 'O', label: 'O', aide: 'Occlusale / incisive (surface de mastication)' },
  { key: 'D', label: 'D', aide: 'Distale (vers le fond)' },
  { key: 'V', label: 'V', aide: 'Vestibulaire (côté joue ou lèvre)' },
  { key: 'P', label: 'P', aide: 'Palatine / linguale (côté langue)' },
]

const VALID_FACES = new Set<string>(DENTAL_FACES.map((f) => f.key))
const FACE_RANK: Record<string, number> = Object.fromEntries(DENTAL_FACES.map((f, i) => [f.key, i]))
export const DENTAL_FACE_LABEL: Record<string, string> =
  Object.fromEntries(DENTAL_FACES.map((f) => [f.key, f.aide]))

// Quels états se localisent sur une face. Une couronne coiffe la dent entière,
// un implant la remplace, une dent extraite n'a plus de face : proposer des
// cases à cocher pour ces états-là inviterait à saisir un non-sens.
// Une couronne coiffe la dent entière, un implant la remplace, une dent
// extraite n'a plus de face, une mobilité concerne la dent dans son ensemble :
// proposer des cases de face pour ces états inviterait à saisir un non-sens.
export const ETATS_AVEC_FACES = new Set<ToothStatus>(['carie', 'obturation', 'fracture'])

export const DENTAL_LABEL: Record<string, string> = Object.fromEntries(DENTAL_STATES.map((s) => [s.key, s.label]))
export const DENTAL_COLOR: Record<string, string> = Object.fromEntries(DENTAL_STATES.map((s) => [s.key, s.color]))

const VALID_STATES = new Set<string>(DENTAL_STATES.map((s) => s.key))
// Ordre canonique de stockage et d'affichage : celui de la légende, pour que deux
// dents portant les mêmes états s'affichent toujours de la même façon.
const STATE_RANK: Record<string, number> = Object.fromEntries(DENTAL_STATES.map((s, i) => [s.key, i]))

// Quand une dent cumule plusieurs états, la couleur de fond ne peut en montrer
// qu'un : on met en avant ce qui doit sauter aux yeux du praticien (l'urgence, puis
// la pathologie) ; les états « réparés » ne servent que de marqueur secondaire.
const PRIMARY_PRIORITY: ToothStatus[] = [
  'extraite', 'a_extraire', 'fracture', 'carie', 'mobilite',
  'implant', 'bridge', 'couronne', 'endodontie', 'obturation',
]

// Arcades, dans l'ordre d'affichage (vue du praticien : côté droit du patient à gauche).
export const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

// Denture temporaire (dents de lait) — numérotation FDI 51 à 85, même ordre de
// lecture : côté droit du patient à gauche de l'écran. Sans ces deux lignes, un
// enfant de six ans n'avait aucun schéma utilisable, alors que le champ « dent »
// d'un devis acceptait déjà ces numéros.
export const FDI_UPPER_LAIT = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
export const FDI_LOWER_LAIT = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

/** Une dent de lait se reconnaît à son premier chiffre (5 à 8). */
export function estDentDeLait(n: string | number): boolean {
  const t = String(n)
  return /^[5-8][1-5]$/.test(t)
}

// Le schéma dentaire ne concerne que les spécialités dentaires.
export function isDentalDoctor(specialties: (string | null | undefined)[]): boolean {
  return specialties.some((s) => !!s && /dent|stomato|orthodont|odonto/i.test(s))
}

// Les états d'UNE dent, quel que soit le format stocké. Point de passage unique :
// filtre les valeurs inconnues (données anciennes ou saisies à la main en base),
// dédoublonne, trie, et applique la règle métier d'exclusivité de « extraite ».
export function toothStates(info: StoredToothInfo | ToothInfo | null | undefined): ToothStatus[] {
  if (!info || typeof info !== 'object') return []
  const raw = Array.isArray(info.s) ? info.s : info.s ? [info.s] : []
  const out: ToothStatus[] = []
  for (const s of raw) {
    if (typeof s === 'string' && VALID_STATES.has(s) && !out.includes(s as ToothStatus)) out.push(s as ToothStatus)
  }
  // Une dent absente ne peut être ni cariée ni couronnée : « extraite » écrase tout.
  if (out.includes('extraite')) return ['extraite']
  return out.sort((a, b) => STATE_RANK[a] - STATE_RANK[b])
}

/** Les faces d'UN état, quel que soit ce qui dort en base. Filtre les valeurs
 *  inconnues, dédoublonne et trie dans l'ordre de la légende. */
export function toothFaces(
  info: StoredToothInfo | ToothInfo | null | undefined,
  state: ToothStatus,
): ToothFace[] {
  const brut = (info as { f?: Record<string, unknown> } | null)?.f?.[state]
  if (!Array.isArray(brut)) return []
  const out: ToothFace[] = []
  for (const f of brut) {
    if (typeof f === 'string' && VALID_FACES.has(f) && !out.includes(f as ToothFace)) out.push(f as ToothFace)
  }
  return out.sort((a, b) => FACE_RANK[a] - FACE_RANK[b])
}

/** Toutes les faces d'une dent, état par état — déjà filtrées sur les états
 *  réellement présents et sur ceux qui acceptent une face. */
export function allToothFaces(
  info: StoredToothInfo | ToothInfo | null | undefined,
): Partial<Record<ToothStatus, ToothFace[]>> {
  const out: Partial<Record<ToothStatus, ToothFace[]>> = {}
  for (const s of toothStates(info)) {
    if (!ETATS_AVEC_FACES.has(s)) continue
    const faces = toothFaces(info, s)
    if (faces.length > 0) out[s] = faces
  }
  return out
}

/** Coche / décoche une face pour un état. */
export function toggleFace(current: ToothFace[], f: ToothFace): ToothFace[] {
  return current.includes(f)
    ? current.filter((x) => x !== f)
    : [...current, f].sort((a, b) => FACE_RANK[a] - FACE_RANK[b])
}

/** « O, M » — ce que le praticien écrit à la main. */
export function facesLabel(faces: ToothFace[]): string {
  return faces.join(', ')
}

/** « Carie (O, M), Plombage (D) » — pour les infobulles, le journal et le PDF. */
export function statesWithFacesLabel(info: StoredToothInfo | ToothInfo | null | undefined): string {
  return toothStates(info)
    .map((s) => {
      const faces = toothFaces(info, s)
      return faces.length > 0 ? `${DENTAL_LABEL[s]} (${facesLabel(faces)})` : DENTAL_LABEL[s]
    })
    .join(', ')
}

// Normalise la carte entière lue en base (ancien OU nouveau format) vers le format
// tableau utilisé partout dans le code. Ne touche évidemment à rien en base.
const VALID_NATURES = new Set<string>(DENTAL_NATURES.map((n) => n.key))

/** Les natures d'une dent, limitées aux états réellement présents et aux
 *  valeurs connues. Point de passage unique, comme pour les faces. */
function toutesLesNatures(value: StoredToothInfo, etats: ToothStatus[]): Partial<Record<ToothStatus, ToothNature>> {
  const brut = (value as { p?: Record<string, unknown> } | null)?.p
  const out: Partial<Record<ToothStatus, ToothNature>> = {}
  if (!brut || typeof brut !== 'object') return out
  for (const e of etats) {
    const v = brut[e]
    // « constate » n'est pas écrit : c'est le défaut, et l'omettre garde le
    // jsonb lisible et compatible avec ce qui existait avant les natures.
    if (typeof v === 'string' && VALID_NATURES.has(v) && v !== 'constate') out[e] = v as ToothNature
  }
  return out
}

/** Les dates de pose, au format YYYY-MM-DD, limitées aux états présents. */
function toutesLesDates(value: StoredToothInfo, etats: ToothStatus[]): Partial<Record<ToothStatus, string>> {
  const brut = (value as { d?: Record<string, unknown> } | null)?.d
  const out: Partial<Record<ToothStatus, string>> = {}
  if (!brut || typeof brut !== 'object') return out
  for (const e of etats) {
    const v = brut[e]
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[e] = v
  }
  return out
}

export function normalizeTeeth(raw: StoredDentalTeeth | DentalTeeth | null | undefined): DentalTeeth {
  const out: DentalTeeth = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw)) {
    const s = toothStates(value as StoredToothInfo)
    if (s.length === 0) continue // une dent sans état n'a rien à faire dans le schéma
    const note = typeof value?.n === 'string' && value.n.trim() ? value.n : undefined
    // Les faces suivent leur état : une face rattachée à un état disparu, ou à
    // un état qui n'en accepte pas, n'a plus de sens et n'est pas conservée.
    const faces = allToothFaces(value as StoredToothInfo)
    // Natures et dates suivent elles aussi leur état : garder la nature d'un
    // état décoché laisserait une trace invisible qui ressortirait le jour où
    // l'état est recoché, avec une date périmée.
    const natures = toutesLesNatures(value as StoredToothInfo, s)
    const dates = toutesLesDates(value as StoredToothInfo, s)
    out[key] = {
      s,
      ...(note ? { n: note } : {}),
      ...(Object.keys(faces).length > 0 ? { f: faces } : {}),
      ...(Object.keys(natures).length > 0 ? { p: natures } : {}),
      ...(Object.keys(dates).length > 0 ? { d: dates } : {}),
    }
  }
  return out
}

// Coche / décoche un état en respectant l'exclusivité de « extraite » dans les deux
// sens : cocher « extraite » vide le reste, cocher autre chose la retire.
export function toggleToothState(current: ToothStatus[], s: ToothStatus): ToothStatus[] {
  if (current.includes(s)) return current.filter((x) => x !== s)
  if (s === 'extraite') return ['extraite']
  return [...current.filter((x) => x !== 'extraite'), s].sort((a, b) => STATE_RANK[a] - STATE_RANK[b])
}

// État qui donne sa couleur de fond à la dent (cf. PRIMARY_PRIORITY).
export function primaryState(states: ToothStatus[]): ToothStatus | undefined {
  if (states.length === 0) return undefined
  return PRIMARY_PRIORITY.find((p) => states.includes(p)) ?? states[0]
}

// Couleurs d'une dent : la principale d'abord, puis les autres dans l'ordre de la
// légende. L'écran comme le PDF en font une bande de pastilles sous le numéro.
export function stateColors(states: ToothStatus[]): string[] {
  const primary = primaryState(states)
  if (!primary) return []
  return [DENTAL_COLOR[primary], ...states.filter((s) => s !== primary).map((s) => DENTAL_COLOR[s])]
}

// « Couronne, Carie » — libellés lisibles pour les infobulles et le PDF.
export function statesLabel(states: ToothStatus[]): string {
  return states.map((s) => DENTAL_LABEL[s] || s).join(', ')
}

// Résumé compact pour l'export : [{ label:'Carie', teeth:['16','24'] }, …].
// Une dent qui cumule plusieurs états apparaît sous CHACUN d'eux.
export function summarizeTeeth(teeth: StoredDentalTeeth | DentalTeeth | null | undefined): { label: string; teeth: string[] }[] {
  const norm = normalizeTeeth(teeth)
  return DENTAL_STATES
    .map((st) => ({
      label: st.label,
      teeth: Object.keys(norm)
        .filter((k) => norm[k].s.includes(st.key))
        .sort((a, b) => Number(a) - Number(b))
        // « 16 (O, M) » : sans la face, l'export perd ce qui distingue une
        // carie d'une dent entièrement refaite.
        .map((k) => {
          const faces = toothFaces(norm[k], st.key)
          return faces.length > 0 ? `${k} (${facesLabel(faces)})` : k
        }),
    }))
    .filter((g) => g.teeth.length > 0)
}

// Forme d'un numéro de dent FDI : deux chiffres de 1 à 8 — 11-48 pour les
// dents définitives, 51-85 pour les dents de lait. On valide la FORME et non
// la liste exacte : un contrôle plus serré finirait par refuser une notation
// légitime chez l'enfant. Utilisé par les devis (v54), où la dent est
// facultative — un détartrage ne vise aucune dent précise.
export const FDI_RE = /^[1-8][1-8]$/
export function isValidTooth(t: string): boolean {
  return FDI_RE.test(t)
}
