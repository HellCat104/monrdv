// Forfaits MonRDV — source de vérité unique des droits par plan.
// 'agenda'  (149 DH) : prise de RDV seule — aucune donnée de santé (CNDP).
// 'complet' (299 DH) : cabinet complet (dossiers, consultation, factures…).
//
// Toute vérification d'accès liée au forfait passe par ce module (UI ET
// serveur), comme lib/cabinet.ts le fait pour les permissions secrétaire.

export type DoctorPlan = 'agenda' | 'complet'

export interface PlanFeatures {
  /** Dossier médical complet : antécédents, constantes, documents, CIN, mutuelle… */
  records: boolean
  /** Écran consultation (note, constantes du jour) */
  consultation: boolean
  /** Ordonnances & certificats */
  prescriptions: boolean
  /** Factures, reçus, avoirs, caisse */
  billing: boolean
  /** Statistiques d'activité et de chiffre d'affaires */
  stats: boolean
}

export const PLAN_LABELS: Record<DoctorPlan, string> = {
  agenda: 'Agenda',
  complet: 'Cabinet complet',
}

export const PLAN_PRICES_DHS: Record<DoctorPlan, number> = {
  agenda: 149,
  complet: 299,
}

const FEATURES: Record<DoctorPlan, PlanFeatures> = {
  agenda: {
    records: false,
    consultation: false,
    prescriptions: false,
    billing: false,
    stats: false,
  },
  complet: {
    records: true,
    consultation: true,
    prescriptions: true,
    billing: true,
    stats: true,
  },
}

/** Normalise la valeur stockée (colonne absente / null ⇒ 'agenda', le défaut SQL). */
export function normalizePlan(plan?: string | null): DoctorPlan {
  return plan === 'complet' ? 'complet' : 'agenda'
}

export function planFeatures(plan?: string | null): PlanFeatures {
  return FEATURES[normalizePlan(plan)]
}

export function canAccess(plan: string | null | undefined, feature: keyof PlanFeatures): boolean {
  return planFeatures(plan)[feature]
}
