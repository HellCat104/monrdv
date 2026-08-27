// Constantes de pré-comptabilité, partagées entre l'écran et les exports.

/**
 * Liste volontairement courte et fermée : une saisie libre produit
 * « loyer », « Loyer », « LOYER cabinet »… et rend tout regroupement
 * impossible. Quatre postes couvrent l'essentiel d'un cabinet.
 */
export const EXPENSE_CATEGORIES = [
  'Matériel / Consommables',
  'Loyers / Charges',
  'Honoraires / Salaires',
  'Assurances',
  'Autre',
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

/** Une dépense enregistrée avant l'introduction des catégories n'en a pas. */
export function expenseCategoryLabel(c?: string | null): string {
  return c && (EXPENSE_CATEGORIES as readonly string[]).includes(c) ? c : 'Non classé'
}

/** Variation entre deux périodes, en pourcentage. `null` si rien à comparer. */
export function variation(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
