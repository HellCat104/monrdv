// Adresse d'un fichier de public/, versionnée par l'empreinte de son contenu.
//
// POURQUOI : un fichier servi sous un nom fixe peut rester en cache dans le
// navigateur après sa modification. Safari le fait avec les PDF, même après
// rechargement — le 19-09-2026, la documentation sans prix s'affichait encore
// avec l'ancien prix sur iPhone et sur Mac. Le `?v=<empreinte>` change tout
// seul dès que le contenu change : impossible d'oublier de le mettre à jour.
//
// Les empreintes sont calculées au build par next.config.js.
//
// RÈGLE : tout lien vers un fichier de public/ passe par cette fonction.
// scripts/verifier-fichiers-publics.js fait échouer le build sinon — c'est ce
// qui empêche le problème de revenir.

const EMPREINTES: Record<string, string> = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_EMPREINTES_FICHIERS || '{}')
  } catch {
    return {}
  }
})()

/**
 * `fichierPublic('/documentation-monrdv.pdf')` → `/documentation-monrdv.pdf?v=3f9a1c20b7e4`
 *
 * Un chemin inconnu est rendu tel quel plutôt que de faire planter la page :
 * le contrôle de build a déjà vérifié que chaque chemin existe.
 */
export function fichierPublic(chemin: string): string {
  const v = EMPREINTES[chemin]
  return v ? `${chemin}?v=${v}` : chemin
}
