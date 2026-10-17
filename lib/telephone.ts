// Normalisation des numéros au format que Meta emploie (« wa_id »).
//
// Meta identifie un patient par « 212612345678 » : chiffres seuls, sans « + ».
// `patients.phone` est un TEXT libre — « 0612345678 », « 06 12 34 56 78 »,
// « +212 6 12 34 56 78 » désignent la même personne. Comparer sans normaliser
// ne lève aucune erreur : ça ne trouve simplement personne, et le chatbot
// traiterait chaque patient connu comme un inconnu. Échec muet, le pire genre.
//
// Ce fichier DOIT rester le miroir exact de la colonne générée
// `patients.phone_norm` (migration v73) : toute divergence entre les deux fait
// échouer la recherche en silence. Si l'une change, l'autre change le même jour.
//
// Pourquoi ne pas réutiliser `formatPhoneMaroc` de lib/utils.ts : elle produit
// « +212… » (format d'affichage, pas celui de Meta) et surtout elle PRÉFIXE de
// 212 n'importe quel numéro non reconnu — un patient français en +33 deviendrait
// « +21233… ». Acceptable pour un affichage, destructeur pour une identification.

/**
 * Convertit un numéro saisi librement en identifiant de type `wa_id`.
 * Un numéro étranger déjà préfixé de son indicatif est conservé tel quel :
 * on ne force jamais l'indicatif marocain.
 * @returns le numéro normalisé, ou null si la saisie ne contient aucun chiffre.
 */
export function normaliserTelephone(saisie?: string | null): string | null {
  const chiffres = (saisie ?? '').replace(/\D/g, '')
  if (!chiffres) return null

  // 00212… / 0033… : préfixe de sortie international
  if (chiffres.startsWith('00')) return chiffres.substring(2)

  // 212… : déjà au format Meta
  if (chiffres.startsWith('212')) return chiffres

  // 0612345678 : numéro national marocain
  if (chiffres.startsWith('0') && chiffres.length === 10) return `212${chiffres.substring(1)}`

  // 612345678 : national sans le zéro
  if (chiffres.length === 9) return `212${chiffres}`

  // Indicatif étranger ou forme inattendue : on ne devine pas.
  return chiffres
}

/**
 * Affichage lisible d'un `wa_id` marocain : « 212612345678 » → « 06 12 34 56 78 ».
 * Tout numéro non marocain est rendu en « +indicatif… », sans regroupement :
 * les conventions de découpage varient d'un pays à l'autre et une mise en forme
 * fausse se lit plus mal qu'une absence de mise en forme.
 */
export function afficherTelephone(waId?: string | null): string {
  const n = normaliserTelephone(waId)
  if (!n) return ''
  if (!n.startsWith('212') || n.length !== 12) return `+${n}`
  const national = `0${n.substring(3)}`
  return national.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5')
}

/**
 * Forme nationale marocaine attendue par `POST /api/appointments`, qui valide
 * le numéro avec `isValidPhoneMaroc` : « 212612345678 » → « 0612345678 ».
 *
 * @returns null si le numéro n'est pas marocain. Le chatbot ne peut alors pas
 *          créer la fiche (la route refuserait), et passe la main au cabinet
 *          plutôt que d'échouer silencieusement.
 */
export function versNationalMaroc(waId?: string | null): string | null {
  const n = normaliserTelephone(waId)
  if (!n || !n.startsWith('212') || n.length !== 12) return null
  return `0${n.substring(3)}`
}
