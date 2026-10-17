/**
 * Correspondance slug SEO ↔ nom réel
 * Utilisé pour les pages /medecin/[specialite]/[ville]
 */

export const SPECIALITE_SLUGS: Record<string, string> = {
  'medecin-generaliste':      'Médecin généraliste',
  'cardiologue':               'Cardiologue',
  'dermatologue':              'Dermatologue',
  'medecine-esthetique':       'Médecine esthétique',
  'pediatre':                  'Pédiatre',
  'ophtalmologue':             'Ophtalmologue',
  'dentiste':                  'Dentiste',
  'neurologue':                'Neurologue',
  'pneumologue':               'Pneumologue',
  'psychiatre':                'Psychiatre',
  'rhumatologue':              'Rhumatologue',
  'urologue':                  'Urologue',
  'gastro-enterologue':        'Gastro-entérologue',
  'gynecologue':               'Gynécologue',
  'orthopediste':              'Orthopédiste',
  'endocrinologue':            'Endocrinologue',
  'orl':                       'ORL (Oto-rhino-laryngologiste)',
  'chirurgien-general':        'Chirurgien général',
  'chirurgien-orthopedique':   'Chirurgien orthopédique',
  'anesthesiste':              'Anesthésiste-réanimateur',
  'radiologue':                'Radiologue',
  'nephrologue':               'Néphrologue',
  'hematologue':               'Hématologue',
  'oncologue':                 'Oncologue',
  'infectiologue':             'Infectiologue',
  'allergologue':              'Allergologue',
  'medecin-du-sport':          'Médecin du sport',
  'geriatre':                  'Gériatre',
  'nutritionniste':            'Nutritionniste / Diététicien',
  'kinesitherapeute':          'Kinésithérapeute',
  'psychologue':               'Psychologue',
  'stomatologiste':            'Stomatologiste',
}

export const VILLE_SLUGS: Record<string, string> = {
  'casablanca':    'Casablanca',
  'rabat':         'Rabat',
  'marrakech':     'Marrakech',
  'fes':           'Fès',
  'tanger':        'Tanger',
  'agadir':        'Agadir',
  'meknes':        'Meknès',
  'oujda':         'Oujda',
  'kenitra':       'Kénitra',
  'tetouan':       'Tétouan',
  'sale':          'Salé',
  'temara':        'Témara',
  'mohammedia':    'Mohammedia',
  'el-jadida':     'El Jadida',
  'beni-mellal':   'Béni Mellal',
  'nador':         'Nador',
  'settat':        'Settat',
  'khouribga':     'Khouribga',
  'safi':          'Safi',
  'laayoune':      'Laâyoune',
  'essaouira':     'Essaouira',
  'ouarzazate':    'Ouarzazate',
  'taza':          'Taza',
  'khemisset':     'Khémisset',
  'berrechid':     'Berrechid',
  'larache':       'Larache',
  'khenifra':      'Khénifra',
  'dakhla':        'Dakhla',
  'tiznit':        'Tiznit',
  'taroudant':     'Taroudant',
  'al-hoceima':    'Al Hoceïma',
  'errachidia':    'Errachidia',
  'guelmim':       'Guelmim',
}


// Le mot que les gens tapent réellement, qui n'est pas toujours le nom de la
// spécialité. On cherche « médecin esthétique », pas « médecine esthétique » ;
// et la formule « un médecine esthétique à Casablanca » était du français
// fautif servi à Google sur la page de liste.
// Absent de cette table = le nom de la spécialité en minuscules convient.
export const PRATICIEN: Record<string, string> = {
  'medecine-esthetique': 'médecin esthétique',
  'orl':                 'ORL',
  'nutritionniste':      'nutritionniste',
  'medecin-du-sport':    'médecin du sport',
  'medecin-generaliste': 'médecin généraliste',
}

/** Nom du praticien tel qu'on le cherche : « médecin esthétique », « cardiologue ». */
export function praticienDepuisSlug(slug: string): string {
  return PRATICIEN[slug] ?? (SPECIALITE_SLUGS[slug] ?? '').toLowerCase()
}

// Variantes courantes renvoyées en 308 vers l'URL canonique. Sans elles,
// /medecin/medecine-esthetique/casa renvoyait une 404 — or « casa » est la
// façon dont on nomme Casablanca au quotidien.
export const SPECIALITE_ALIAS: Record<string, string> = {
  'medecin-esthetique':   'medecine-esthetique',
  'esthetique':           'medecine-esthetique',
  'generaliste':          'medecin-generaliste',
  'medecin-general':      'medecin-generaliste',
  'chirurgien-dentiste':  'dentiste',
  'dermato':              'dermatologue',
  'cardio':               'cardiologue',
  'gyneco':               'gynecologue',
  'ophtalmo':             'ophtalmologue',
  'pediatrie':            'pediatre',
  'kine':                 'kinesitherapeute',
  'orthopedie':           'orthopediste',
  'radiologie':           'radiologue',
  'oto-rhino-laryngologiste': 'orl',
}

export const VILLE_ALIAS: Record<string, string> = {
  'casa':      'casablanca',
  'casablanca-maroc': 'casablanca',
  'fez':       'fes',
  'tangier':   'tanger',
  'marrakesh': 'marrakech',
  'agadir-maroc': 'agadir',
}

export function getSpecialiteFromSlug(slug: string): string | null {
  return SPECIALITE_SLUGS[slug] ?? null
}

export function getVilleFromSlug(slug: string): string | null {
  return VILLE_SLUGS[slug] ?? null
}

/**
 * Anciens slugs de praticiens → slug courant.
 *
 * Le slug d'un médecin est son adresse publique : elle figure sur ses cartes de
 * visite, dans sa bio Instagram, dans les e-mails déjà envoyés et dans l'index
 * de Google. La corriger est parfois nécessaire — un slug qui contient déjà
 * « dr » produit une URL du type `/dr-dr-el-alj-hassan` — mais la changer sans
 * rien d'autre casse tous les liens existants et fait perdre l'antériorité
 * acquise par l'ancienne adresse.
 *
 * Chaque entrée fait rediriger l'ancienne adresse en 308 vers la nouvelle, ce
 * qui transmet le référencement au lieu de le perdre. La clé est le slug tel
 * qu'il apparaît dans l'URL APRÈS le préfixe « dr- ».
 *
 * Le cas du « dr- » doublé est traité automatiquement dans app/[slug]/page.tsx
 * et n'a pas besoin d'entrée ici. Cette table sert aux cas qu'aucune règle ne
 * peut deviner sans risque : retirer un « dr » collé au prénom casserait les
 * noms qui commencent réellement par ces lettres — Drissi, par exemple.
 */
export const SLUG_MEDECIN_ALIAS: Record<string, string> = {
  // Dr Youssef Nachid — le slug portait « dr » collé au prénom, ce qui donnait
  // l'adresse `/dr-dryoussef-nachid`. Cette entrée est posée AVANT la
  // correction en base : tant que le slug n'a pas changé, la fiche répond
  // normalement et la ligne ne sert à rien ; dès qu'il change, l'ancienne
  // adresse redirige au lieu de tomber en 404. Sans danger dans les deux sens.
  'dryoussef-nachid': 'youssef-nachid',
  // Dr El Alj Hassan (`/dr-dr-el-alj-hassan`) n'a pas besoin d'entrée : le
  // « dr- » doublé est traité par la règle automatique.
}

/**
 * Nom courant d'une ville, tel que les gens le tapent réellement.
 *
 * On cherche « dentiste casa », pas « dentiste casablanca ». Les pages
 * ville/spécialité n'écrivaient que la forme officielle : le mot « Casa »
 * n'apparaissait nulle part sur le site. Google rapproche assez bien les deux,
 * mais une page qui emploie la forme réellement recherchée part avec un
 * avantage sur une page qui l'ignore.
 *
 * La table reste minuscule à dessein : on n'ajoute une entrée que là où
 * l'abréviation est d'usage universel. Inventer des variantes pour remplir la
 * page serait du bourrage de mots-clés, que Google sanctionne.
 */
export const VILLE_NOM_FAMILIER: Record<string, string> = {
  'casablanca': 'Casa',
}
