// Stockage des documents d'un cabinet (v62 / v63).
//
// Trois limites, à trois endroits, parce qu'aucune ne suffit seule :
//   • 10 Mo par fichier — vérifiée par le navigateur ET par le dépôt (v62) ;
//   • 5 Go par cabinet  — vérifiée par un trigger en base (v63), donc valable
//     même pour un appel direct à l'API ;
//   • la jauge des Paramètres, qui n'interdit rien mais évite au médecin de
//     découvrir la limite au moment où il en a besoin.

/** Quota par défaut d'un cabinet, en mégaoctets (5 Go). Voir migration v63. */
export const QUOTA_DEFAUT_MO = 5120

/** Poids maximal d'un document, en octets. Doit rester égal au
 *  `file_size_limit` du dépôt `patient-documents` (migration v62). */
export const DOC_MAX_OCTETS = 10 * 1024 * 1024

/** « 1,9 Mo », « 912 ko »… Une taille lisible par un médecin, pas par un ingénieur. */
export function formatOctets(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 ko'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} ko`
  const mo = n / 1024 / 1024
  if (mo < 1024) return `${mo < 10 ? mo.toFixed(1).replace('.', ',') : Math.round(mo)} Mo`
  return `${(mo / 1024).toFixed(1).replace('.', ',')} Go`
}

/**
 * Espace occupé par les documents d'un cabinet, en octets.
 *
 * On ne lit que la colonne `file_size` : une ligne par document, quelques
 * octets chacune. Les documents déposés avant la v62 valent NULL et comptent
 * donc pour zéro — ils sont trop peu nombreux pour fausser la jauge.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function espaceOccupe(supabase: any, doctorId: string): Promise<number> {
  const { data, error } = await supabase
    .from('patient_documents').select('file_size').eq('doctor_id', doctorId)
  if (error || !data) return 0
  return (data as { file_size: number | null }[]).reduce((s, d) => s + (d.file_size ?? 0), 0)
}

/**
 * Le trigger de la v63 lève « QUOTA_STOCKAGE: … ». Traduit cette exception en
 * phrase utile ; renvoie null si l'échec a une autre cause.
 */
export function messageQuota(e: unknown): string | null {
  const texte = typeof e === 'string' ? e : (e as { message?: string })?.message ?? ''
  if (!texte.includes('QUOTA_STOCKAGE')) return null
  return "L'espace de stockage de votre cabinet est atteint. Supprimez des documents devenus inutiles, "
    + 'ou contactez MonRDV pour l’augmenter.'
}
