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
  /** Encaisser une consultation, tenir la caisse et les dépenses */
  payments: boolean
  /** Documents comptables : factures conformes, avoirs, pack pour le fiduciaire */
  invoicing: boolean
  /** Accès à l'écran Statistiques (contenu adapté au forfait) */
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
  // Le forfait Agenda suit son activité et son argent, mais ne touche ni au
  // dossier médical ni aux documents comptables légaux.
  agenda: {
    records: false,
    consultation: false,
    prescriptions: false,
    payments: true,
    invoicing: false,
    stats: true,
  },
  complet: {
    records: true,
    consultation: true,
    prescriptions: true,
    payments: true,
    invoicing: true,
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
