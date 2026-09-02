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
