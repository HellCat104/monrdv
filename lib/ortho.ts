// Orthodontie — règles pures. Un traitement se mesure en MOIS : tout ce
// fichier sert à répondre à « où en est-on ? » sans que le praticien compte
// sur ses doigts.

export const ORTHO_STATUTS = ['en_cours', 'contention', 'termine', 'interrompu'] as const
export type OrthoStatut = (typeof ORTHO_STATUTS)[number]

export const ORTHO_STATUT_LABELS: Record<OrthoStatut, string> = {
  en_cours: 'En cours',
  contention: 'Contention',
  termine: 'Terminé',
  interrompu: 'Interrompu',
}

export const ORTHO_STATUT_COULEURS: Record<OrthoStatut, string> = {
  en_cours: 'bg-blue-50 text-blue-700',
  contention: 'bg-amber-50 text-amber-700',
  termine: 'bg-green-50 text-green-700',
  interrompu: 'bg-gray-100 text-gray-500',
}

export const ORTHO_ARCADES: { cle: 'haut' | 'bas' | 'deux'; label: string }[] = [
  { cle: 'haut', label: 'Arcade supérieure' },
  { cle: 'bas', label: 'Arcade inférieure' },
  { cle: 'deux', label: 'Les deux arcades' },
]

// Appareils proposés à la saisie. Liste ouverte : le champ reste libre.
export const ORTHO_APPAREILS = [
  'Multibagues métal', 'Multibagues céramique', 'Aligneurs',
  'Appareil amovible', 'Disjoncteur', 'Quad hélix', 'Contention',
]

// Actes d'une séance. Même principe : proposés, jamais imposés.
export const ORTHO_ACTES = [
  'Activation', "Changement d'arc", 'Collage', 'Recollage de bague',
  'Décollage', 'Pose de contention', 'Contrôle', 'Urgence',
]

export interface OrthoVisite {
  id: string
  visit_date: string
  act: string | null
  wire: string | null
  next_visit: string | null
  notes: string | null
}

export interface OrthoTraitement {
  id: string
  patient_id: string
  quote_id: string | null
  appliance: string | null
  arches: 'haut' | 'bas' | 'deux' | null
  started_on: string | null
  planned_months: number | null
  ended_on: string | null
  status: OrthoStatut
  diagnosis: string | null
  goals: string | null
  notes: string | null
  visits?: OrthoVisite[]
}

/** Mois entiers écoulés entre deux dates. */
export function moisEcoules(debut: string | null | undefined, aujourdhui: string): number | null {
  if (!debut) return null
  const d = new Date(`${debut}T00:00:00Z`)
  const a = new Date(`${aujourdhui}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(a.getTime()) || a < d) return null
  let mois = (a.getUTCFullYear() - d.getUTCFullYear()) * 12 + (a.getUTCMonth() - d.getUTCMonth())
  if (a.getUTCDate() < d.getUTCDate()) mois -= 1
  return Math.max(0, mois)
}

/** Fin prévue = début + durée annoncée. Null tant que l'un des deux manque :
 *  une date de fin inventée serait une promesse faite au patient. */
export function finPrevue(debut: string | null | undefined, mois: number | null | undefined): string | null {
  if (!debut || !mois) return null
  const d = new Date(`${debut}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCMonth(d.getUTCMonth() + mois)
  return d.toISOString().slice(0, 10)
}

export interface OrthoAvancement {
  mois: number | null
  prevus: number | null
  pourcent: number | null
  /** Le traitement dépasse la durée annoncée au patient. */
  depasse: boolean
  finPrevue: string | null
}

/** « Mois 7 sur 18 » — la seule phrase que le patient retient. */
export function avancement(t: OrthoTraitement, aujourdhui: string): OrthoAvancement {
  const mois = moisEcoules(t.started_on, t.ended_on ?? aujourdhui)
  const prevus = t.planned_months ?? null
  const pourcent = mois !== null && prevus ? Math.min(100, Math.round((mois / prevus) * 100)) : null
  return {
    mois,
    prevus,
    pourcent,
    depasse: mois !== null && !!prevus && mois > prevus && t.status === 'en_cours',
    finPrevue: finPrevue(t.started_on, prevus),
  }
}

/** La prochaine séance annoncée : celle de la visite la plus récente. */
export function prochaineSeance(visites: OrthoVisite[] | undefined): string | null {
  if (!visites || visites.length === 0) return null
  const triees = visites.slice().sort((a, b) => b.visit_date.localeCompare(a.visit_date))
  return triees[0].next_visit ?? null
}

/** Un traitement en cours dont la prochaine séance est passée : le patient a
 *  sauté son rendez-vous, et en ortho un mois perdu rallonge le traitement. */
export function seanceEnRetard(t: OrthoTraitement, aujourdhui: string): boolean {
  if (t.status !== 'en_cours') return false
  const p = prochaineSeance(t.visits)
  return !!p && p < aujourdhui
}

/** Champs communs à l'ouverture et à la mise à jour d'un traitement.
 *  Vit ici, et non dans la route : un fichier de route Next ne peut exporter
 *  que ses verbes HTTP. */
export function nettoyerTraitement(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const texte = (v: unknown, max: number) => {
    const t = String(v ?? '').trim().slice(0, max)
    return t || null
  }
  if ('appliance' in body) out.appliance = texte(body.appliance, 120)
  if ('diagnosis' in body) out.diagnosis = texte(body.diagnosis, 1000)
  if ('goals' in body) out.goals = texte(body.goals, 1000)
  if ('notes' in body) out.notes = texte(body.notes, 1000)

  if ('arches' in body) {
    const a = String(body.arches ?? '')
    out.arches = ['haut', 'bas', 'deux'].includes(a) ? a : null
  }
  for (const cle of ['started_on', 'ended_on'] as const) {
    if (cle in body) {
      const v = String(body[cle] ?? '')
      out[cle] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
    }
  }
  if ('planned_months' in body) {
    const n = Number(body.planned_months)
    out.planned_months = Number.isInteger(n) && n >= 1 && n <= 72 ? n : null
  }
  if ('status' in body) {
    const s = String(body.status) as OrthoStatut
    if (ORTHO_STATUTS.includes(s)) out.status = s
  }
  return out
}
