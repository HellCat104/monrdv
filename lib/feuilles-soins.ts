// Feuilles de soins — règles partagées entre l'écran, les routes et le document.
//
// Une feuille de soins décrit des actes FAITS, pour que le patient se fasse
// rembourser. Elle ne crée aucune recette (voir l'en-tête de la migration v65),
// et les codes de nomenclature viennent du praticien, jamais du logiciel.
export const STATUTS_FEUILLE = ['etablie', 'remise', 'remboursee'] as const
export type StatutFeuille = (typeof STATUTS_FEUILLE)[number]

export const STATUT_FEUILLE_LABELS: Record<StatutFeuille, string> = {
  etablie: 'Établie',
  remise: 'Remise au patient',
  remboursee: 'Remboursée',
}

export interface LigneFeuille {
  id?: string
  tooth: string | null
  code: string | null
  label: string
  amount: number
  position?: number
}

/** Montant d'une feuille : la somme de ses lignes, jamais un total saisi à
 *  part — un total qui ne correspond pas au détail fait rejeter le dossier. */
export function totalFeuille(lignes: { amount: number | string }[]): number {
  return lignes.reduce((t, l) => t + (Number(l.amount) || 0), 0)
}

/** Nettoie une ligne venue du navigateur. Une ligne sans libellé n'existe pas. */
export function normaliserLigne(brut: unknown, position: number): LigneFeuille | null {
  if (!brut || typeof brut !== 'object') return null
  const l = brut as Record<string, unknown>
  const label = String(l.label ?? '').trim().slice(0, 160)
  if (!label) return null
  const montant = Number(String(l.amount ?? '0').replace(',', '.'))
  return {
    tooth: l.tooth ? String(l.tooth).trim().slice(0, 4) : null,
    code: l.code ? String(l.code).trim().toUpperCase().slice(0, 20) : null,
    label,
    amount: Number.isFinite(montant) && montant >= 0 ? Math.round(montant * 100) / 100 : 0,
    position,
  }
}
