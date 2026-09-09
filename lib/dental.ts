// Schéma dentaire (odontogramme) — constantes partagées entre l'UI et l'export.
// Notation FDI (internationale) : chaque dent porte un numéro à 2 chiffres.

export type ToothStatus = 'carie' | 'obturation' | 'couronne' | 'a_extraire' | 'extraite' | 'implant'

// Une dent porte PLUSIEURS états simultanés : une couronne peut se carier, une dent
// obturée peut devenir à extraire. Format écrit en base (jsonb) :
//   { "16": { "s": ["couronne", "carie"], "n": "à surveiller" } }
export interface ToothInfo { s: ToothStatus[]; n?: string }
export type DentalTeeth = Record<string, ToothInfo>

// Ancien format, antérieur aux états multiples : { "16": { "s": "carie" } }.
// Les lignes déjà en base restent telles quelles (pas de migration SQL, on ne
// réécrit aucune donnée existante). Conséquence : TOUTE lecture doit passer par
// normalizeTeeth() / toothStates(), qui acceptent la chaîne comme le tableau.
export interface StoredToothInfo { s?: ToothStatus | ToothStatus[] | null; n?: string | null }
export type StoredDentalTeeth = Record<string, StoredToothInfo | null | undefined>

export const DENTAL_STATES: { key: ToothStatus; label: string; color: string }[] = [
  { key: 'carie',      label: 'Carie',                 color: '#ef4444' },
  { key: 'obturation', label: 'Plombage / obturation', color: '#3b82f6' },
  { key: 'couronne',   label: 'Couronne',              color: '#f59e0b' },
  { key: 'a_extraire', label: 'À extraire',            color: '#f97316' },
  { key: 'extraite',   label: 'Absente / extraite',    color: '#6b7280' },
  { key: 'implant',    label: 'Implant',               color: '#8b5cf6' },
]
export const DENTAL_LABEL: Record<string, string> = Object.fromEntries(DENTAL_STATES.map((s) => [s.key, s.label]))
export const DENTAL_COLOR: Record<string, string> = Object.fromEntries(DENTAL_STATES.map((s) => [s.key, s.color]))

const VALID_STATES = new Set<string>(DENTAL_STATES.map((s) => s.key))
// Ordre canonique de stockage et d'affichage : celui de la légende, pour que deux
// dents portant les mêmes états s'affichent toujours de la même façon.
const STATE_RANK: Record<string, number> = Object.fromEntries(DENTAL_STATES.map((s, i) => [s.key, i]))

// Quand une dent cumule plusieurs états, la couleur de fond ne peut en montrer
// qu'un : on met en avant ce qui doit sauter aux yeux du praticien (l'urgence, puis
// la pathologie) ; les états « réparés » ne servent que de marqueur secondaire.
const PRIMARY_PRIORITY: ToothStatus[] = ['extraite', 'a_extraire', 'carie', 'implant', 'couronne', 'obturation']

// Arcades, dans l'ordre d'affichage (vue du praticien : côté droit du patient à gauche).
export const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

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

// Normalise la carte entière lue en base (ancien OU nouveau format) vers le format
// tableau utilisé partout dans le code. Ne touche évidemment à rien en base.
export function normalizeTeeth(raw: StoredDentalTeeth | DentalTeeth | null | undefined): DentalTeeth {
  const out: DentalTeeth = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw)) {
    const s = toothStates(value as StoredToothInfo)
    if (s.length === 0) continue // une dent sans état n'a rien à faire dans le schéma
    const note = typeof value?.n === 'string' && value.n.trim() ? value.n : undefined
    out[key] = note ? { s, n: note } : { s }
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
      teeth: Object.keys(norm).filter((k) => norm[k].s.includes(st.key)).sort((a, b) => Number(a) - Number(b)),
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
