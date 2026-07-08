// Schéma dentaire (odontogramme) — constantes partagées entre l'UI et l'export.
// Notation FDI (internationale) : chaque dent porte un numéro à 2 chiffres.

export type ToothStatus = 'carie' | 'obturation' | 'couronne' | 'a_extraire' | 'extraite' | 'implant'
export interface ToothInfo { s: ToothStatus; n?: string }
export type DentalTeeth = Record<string, ToothInfo>

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

// Arcades, dans l'ordre d'affichage (vue du praticien : côté droit du patient à gauche).
export const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

// Résumé compact pour l'export : [{ label:'Carie', teeth:['16','24'] }, …]
export function summarizeTeeth(teeth: DentalTeeth | null | undefined): { label: string; teeth: string[] }[] {
  if (!teeth) return []
  return DENTAL_STATES
    .map((st) => ({
      label: st.label,
      teeth: Object.keys(teeth).filter((k) => teeth[k]?.s === st.key).sort((a, b) => Number(a) - Number(b)),
    }))
    .filter((g) => g.teeth.length > 0)
}
