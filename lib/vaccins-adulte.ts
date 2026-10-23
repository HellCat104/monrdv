// Les vaccins qu'un généraliste administre au cabinet, au Maroc.
//
// Liste PROPOSÉE, jamais fermée : le praticien saisit le sien si l'étiquette
// manque — un vaccin du voyageur ne figure dans aucune liste courte, et
// refuser de l'enregistrer serait absurde.
//
// Ordre voulu : la fréquence au cabinet, pas l'alphabet. Les quatre premiers
// couvrent l'essentiel des injections d'une année ordinaire.
//
// `rappelMois` : délai habituel avant le rappel, utilisé pour pré-remplir la
// date. Indicatif — le médecin la corrige. `null` quand il n'y a pas de
// rappel standard, ou qu'il dépend trop du contexte pour être suggéré.
export interface VaccinAdulte {
  libelle: string
  rappelMois: number | null
}

export const VACCINS_ADULTE: readonly VaccinAdulte[] = [
  { libelle: 'Tétanos (VAT)',                 rappelMois: 120 },
  { libelle: 'Grippe saisonnière',            rappelMois: 12 },
  { libelle: 'Hépatite B',                    rappelMois: 1 },
  { libelle: 'Antirabique',                   rappelMois: null },
  { libelle: 'Hépatite A',                    rappelMois: 6 },
  { libelle: 'Fièvre typhoïde',               rappelMois: 36 },
  { libelle: 'Méningocoque',                  rappelMois: null },
  { libelle: 'Fièvre jaune',                  rappelMois: null },
  { libelle: 'Pneumocoque',                   rappelMois: null },
  { libelle: 'COVID-19',                      rappelMois: null },
  { libelle: 'Diphtérie-Tétanos-Poliomyélite', rappelMois: 120 },
  { libelle: 'Rougeole-Rubéole-Oreillons',    rappelMois: null },
]
