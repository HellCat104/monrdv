// « Cette migration n'est pas encore passée » — reconnaître le cas, partout pareil.
//
// Règle de la maison : une fonctionnalité dont la migration n'a pas été lancée
// se DÉSACTIVE (l'encart disparaît, l'écran s'affiche), elle ne tombe pas en
// erreur. Chaque module récent appliquait cette règle avec le seul code
// PostgreSQL `42P01`.
//
// C'était insuffisant, et ça s'est vu en production sur les feuilles de soins :
// la requête ne touche jamais PostgreSQL, PostgREST répond d'abord depuis SON
// cache de schéma et renvoie `PGRST205` quand la table n'y figure pas — table
// jamais créée, ou cache non rechargé après la migration. Résultat : au lieu de
// l'encart masqué, une erreur 500, et une carte qui affirmait « aucune feuille
// établie pour ce patient » alors qu'elle n'avait rien pu lire.
//
// Même histoire pour une table JOINTE absente : PostgREST ne dit pas « table
// absente » mais « relation introuvable » (`PGRST200`), ou « lien ambigu »
// (`PGRST201`) tant que son cache est en retard.

/** La table elle-même n'existe pas, ou PostgREST l'ignore encore. */
const TABLES = ['42P01', 'PGRST205']

/** La table existe, mais le lien utilisé pour une jointure est introuvable. */
const LIENS = ['PGRST200', 'PGRST201']

/** Une colonne manque : la migration est passée dans une version plus ancienne. */
const COLONNES = ['42703', 'PGRST204']

export function tableAbsente(code?: string | null): boolean {
  return !!code && TABLES.includes(code)
}

export function lienAbsent(code?: string | null): boolean {
  return !!code && LIENS.includes(code)
}

export function colonneAbsente(code?: string | null): boolean {
  return !!code && COLONNES.includes(code)
}
