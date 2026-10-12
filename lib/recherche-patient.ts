// Rechercher un patient par son nom — « Youssef El » doit trouver « Youssef El Amrani ».
//
// LE DÉFAUT CORRIGÉ ICI
//
// La recherche comparait la saisie ENTIÈRE à chaque colonne prise séparément :
// `first_name ilike '%Youssef El%' OR last_name ilike '%Youssef El%'`. Taper le
// prénom seul marchait, taper le nom seul marchait, mais taper les deux — ce que
// fait naturellement une secrétaire qui a le nom complet sous les yeux — ne
// trouvait RIEN et proposait de créer un nouveau patient. C'est-à-dire que le
// geste le plus normal de l'accueil fabriquait des doublons.
//
// La règle est donc : chaque MOT saisi doit se retrouver quelque part (prénom,
// nom ou téléphone), pas forcément dans le même champ. « Youssef El » exige
// « youssef » quelque part ET « el » quelque part ; « El Amrani Youssef » marche
// aussi, l'ordre n'a pas à être deviné.

/** Colonnes dans lesquelles un mot peut se trouver. */
const CHAMPS = ['first_name', 'last_name', 'phone'] as const

/** Les caractères qui ont un sens dans un filtre PostgREST (`%`, `,`, `(`, `)`)
 *  ou dans un LIKE (`_`, `\`) sont retirés : ils n'appartiennent à aucun nom, et
 *  les laisser passer reviendrait à laisser la saisie réécrire la requête. */
function nettoyerMot(mot: string): string {
  return mot.replace(/[%,()\\_*"']/g, '').trim()
}

/** Les mots utiles de la saisie, au plus quatre : au-delà c'est une phrase, pas
 *  un nom, et chaque mot coûte une condition de plus à la base. */
export function motsRecherche(saisie: string): string[] {
  return saisie.split(/\s+/).map(nettoyerMot).filter((m) => m.length > 0).slice(0, 4)
}

/** Le filtre `or(...)` d'UN mot. Les appeler à la suite sur la même requête les
 *  combine en ET — c'est exactement ce qu'on veut. */
export function filtreMot(mot: string): string {
  return CHAMPS.map((c) => `${c}.ilike.%${mot}%`).join(',')
}
