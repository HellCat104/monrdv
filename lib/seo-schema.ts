// Quel type schema.org décrit ce praticien ?
//
// POURQUOI CE N'EST PAS UN DÉTAIL
// Toutes les fiches étaient balisées `Physician`. C'est exact mais vague :
// Google y lit « un médecin », sans savoir de quel métier il s'agit. Or
// schema.org possède des types PRÉCIS sous `MedicalBusiness`, et `Dentist` en
// est un — c'est aussi une catégorie que Google associe à un établissement
// local, donc aux résultats de carte et aux recherches « dentiste près de moi »,
// qui sont la majorité des recherches de santé depuis un téléphone.
//
// Dire « Dentist » plutôt que « Physician » ne change rien à la page lue par un
// humain, et change la catégorie dans laquelle le moteur range le cabinet.
//
// La liste reste volontairement courte : on ne déclare un type précis que là où
// il est certain. Un mauvais type est pire qu'un type générique.

import { isDentalDoctor } from '@/lib/dental'

/** Types `MedicalBusiness` de schema.org que l'on sait attribuer sans risque. */
export type TypeSchemaPraticien = 'Dentist' | 'Pediatric' | 'Psychiatric' | 'Physician'

/**
 * Type schema.org le plus précis pour ces spécialités.
 * @param specialites `specialty` et/ou `specialties` du médecin, dans n'importe
 *        quel ordre — la fonction tolère les valeurs nulles.
 */
export function typeSchemaPraticien(
  specialites: (string | null | undefined)[]
): TypeSchemaPraticien {
  // Dentiste, stomatologue, orthodontiste, odontologue : même règle que le
  // reste de l'application (lib/dental.ts), pour ne pas avoir deux définitions
  // du « dentaire » qui divergent.
  if (isDentalDoctor(specialites)) return 'Dentist'

  const texte = specialites.filter(Boolean).join(' ').toLowerCase()
  if (/p[eé]diatr/.test(texte)) return 'Pediatric'
  // Psychiatre uniquement : un psychologue n'est pas un établissement médical
  // au sens de schema.org, et le ranger là serait une déclaration fausse.
  if (/psychiatr/.test(texte)) return 'Psychiatric'

  return 'Physician'
}

/** Motif de consultation tel que `consultation_types` le stocke. */
interface MotifBalisable {
  name: string
  duration_minutes?: number | null
}

/**
 * Les actes réellement proposés par le cabinet, balisés un par un.
 *
 * Remplace un `availableService` unique et creux (« Consultation médicale »),
 * qui ne disait rien à personne. Les motifs du praticien sont au contraire la
 * matière exacte des recherches longues — « détartrage Casablanca »,
 * « pose d'implant Rabat » — et ils viennent de SES données, jamais d'une liste
 * d'actes devinée : un acte qu'il ne pratique pas n'a rien à faire là.
 *
 * @returns null si le cabinet n'a déclaré aucun motif : on retombe alors sur le
 *          libellé générique, plutôt que d'émettre un tableau vide.
 */
export function actesBalises(motifs: MotifBalisable[] | null | undefined) {
  const liste = (motifs ?? []).filter((m) => m?.name?.trim())
  if (liste.length === 0) return null

  return liste.slice(0, 20).map((m) => ({
    '@type': 'MedicalProcedure' as const,
    name: m.name.trim(),
    ...(m.duration_minutes ? { description: `Durée : ${m.duration_minutes} minutes` } : {}),
  }))
}
