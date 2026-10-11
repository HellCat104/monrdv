// Travaux de laboratoire — règles pures, lues par l'écran comme par les routes.
// Aucun accès serveur ici : ce fichier est importé par des composants clients.

export const LAB_STATUTS = ['a_envoyer', 'envoye', 'recu', 'pose', 'retour_labo', 'annule'] as const
export type LabStatut = (typeof LAB_STATUTS)[number]

export const LAB_STATUT_LABELS: Record<LabStatut, string> = {
  a_envoyer: 'À envoyer',
  envoye: 'Chez le labo',
  recu: 'Revenu au cabinet',
  pose: 'Posé',
  retour_labo: 'Reparti au labo',
  annule: 'Annulé',
}

export const LAB_STATUT_COULEURS: Record<LabStatut, string> = {
  a_envoyer: 'bg-gray-100 text-gray-600',
  envoye: 'bg-blue-50 text-blue-700',
  recu: 'bg-green-50 text-green-700',
  pose: 'bg-gray-100 text-gray-500',
  retour_labo: 'bg-amber-50 text-amber-700',
  annule: 'bg-gray-100 text-gray-400',
}

/** Travaux qui attendent encore quelque chose du laboratoire. « Posé » et
 *  « annulé » sont des fins de parcours : ils quittent les écrans de suivi. */
export const LAB_EN_COURS: LabStatut[] = ['a_envoyer', 'envoye', 'retour_labo']

// Les types proposés à la saisie. Liste ouverte : le champ reste libre, parce
// qu'un praticien a toujours un travail qui n'entre dans aucune case.
export const LAB_TYPES = [
  'Couronne', 'Bridge', 'Inlay / Onlay', 'Facette',
  'Prothèse amovible', 'Gouttière', 'Appareil orthodontique', 'Réparation',
]

export interface LabWork {
  id: string
  patient_id: string
  quote_item_id: string | null
  appointment_id: string | null
  lab_name: string | null
  work_type: string | null
  teeth: string[]
  shade: string | null
  material: string | null
  instructions: string | null
  sent_at: string | null
  due_at: string | null
  received_at: string | null
  status: LabStatut
  cost: number | null
  cost_expense_id: string | null
  notes: string | null
  created_at: string
}

/** En retard : attendu avant aujourd'hui, et toujours pas revenu. C'est la
 *  seule question qui compte le lundi matin. */
export function enRetard(w: { status: LabStatut; due_at: string | null }, aujourdhui: string): boolean {
  return !!w.due_at && w.due_at < aujourdhui && LAB_EN_COURS.includes(w.status)
}

/** Attendu dans les `jours` prochains (aujourd'hui compris). */
export function attenduBientot(
  w: { status: LabStatut; due_at: string | null },
  aujourdhui: string,
  jours = 7,
): boolean {
  if (!w.due_at || !LAB_EN_COURS.includes(w.status)) return false
  const limite = new Date(`${aujourdhui}T00:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + jours)
  return w.due_at >= aujourdhui && w.due_at <= limite.toISOString().slice(0, 10)
}

/** Le patient tel qu'il apparaît sur le bon qui part chez le prothésiste.
 *  Par défaut les initiales : le nom d'un patient n'a pas à circuler hors du
 *  cabinet sans que le praticien l'ait décidé. */
export function nomSurBon(
  first: string | null | undefined,
  last: string | null | undefined,
  mode: 'initiales' | 'complet',
): string {
  const p = (first ?? '').trim()
  const n = (last ?? '').trim()
  if (mode === 'complet') return `${p} ${n}`.trim()
  const i = (s: string) => (s ? `${s[0].toUpperCase()}.` : '')
  return `${i(p)} ${i(n)}`.trim()
}

/** « 16, 17 » — les dents d'un travail, telles qu'on les lit sur un bon. */
export function dentsLabel(teeth: string[] | null | undefined): string {
  return (teeth ?? []).join(', ')
}

/** Intitulé court d'un travail, pour une liste ou une ligne de dépense. */
export function titreTravail(w: { work_type: string | null; teeth: string[] }): string {
  const dents = dentsLabel(w.teeth)
  const type = w.work_type?.trim() || 'Travail de laboratoire'
  return dents ? `${type} · ${dents}` : type
}
