// Professions non prescriptrices (psychologue, kinésithérapeute…).
//
// Ces praticiens ne sont pas médecins : ils n'ont pas de numéro CNOM, ne portent
// pas le titre de « Docteur » et ne rédigent pas d'ordonnances. L'application
// adapte son vocabulaire et masque les fonctions qui ne les concernent pas.
//
// « Nutritionniste / Diététicien » reste traité comme médical : le libellé couvre
// aussi le médecin nutritionniste, qui lui prescrit.
//
// L'orthoptiste est un auxiliaire médical : il rééduque la vision sur
// prescription de l'ophtalmologue, sans titre de docteur ni ordonnance.
// À ne pas confondre avec « Orthopédiste », qui est médecin — les deux mots
// se ressemblent, le motif ci-dessous ne reconnaît que le premier.

const NON_PRESCRIBER = /psychologue|kin[ée]sith[ée]rapeute|orthoptiste/i

export function isNonPrescriber(specialties: (string | null | undefined)[]): boolean {
  return specialties.some((s) => !!s && NON_PRESCRIBER.test(s))
}

/** « Dr. » pour un médecin, rien pour un psychologue, un kinésithérapeute
 *  ou un orthoptiste. */
export function professionalTitle(...specialties: (string | null | undefined)[]): string {
  return isNonPrescriber(specialties) ? '' : 'Dr. '
}

/** Nom affiché, avec ou sans titre selon la profession. */
export function displayName(
  name: string,
  ...specialties: (string | null | undefined)[]
): string {
  return `${professionalTitle(...specialties)}${name}`
}
