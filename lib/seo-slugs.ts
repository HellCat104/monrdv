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

export function getSpecialiteFromSlug(slug: string): string | null {
  return SPECIALITE_SLUGS[slug] ?? null
}

export function getVilleFromSlug(slug: string): string | null {
  return VILLE_SLUGS[slug] ?? null
}
