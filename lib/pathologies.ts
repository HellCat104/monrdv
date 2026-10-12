// Étiquettes de pathologie — règles pures, lues par l'écran comme par les
// routes. Aucun accès serveur ici : ce fichier est importé par des composants
// clients.
//
// L'étiquette sert à RETROUVER (« tous mes diabétiques »). Elle ne remplace pas
// `patients.chronic_conditions`, qui garde la nuance clinique en texte libre
// (voir l'en-tête de la migration v72).

// Liste PROPOSÉE, jamais fermée : le praticien saisit la sienne si elle manque.
// Ordre voulu : la fréquence au cabinet d'un généraliste marocain, pas
// l'alphabet. Les six premières couvrent l'essentiel des consultations de
// suivi ; c'est ce qu'on veut voir sans dérouler la liste.
//
// Quatre entrées sont là pour le Maroc en particulier, et pas par souci
// d'exhaustivité : le RHUMATISME ARTICULAIRE AIGU (les valvulopathies
// post-RAA restent un motif de suivi courant), la TUBERCULOSE (dont le suivi
// post-traitement se prolonge des années), les HÉPATITES B et C, et la
// DRÉPANOCYTOSE (fréquente dans certaines régions).
//
// Les deux diabètes sont distingués : le suivi n'est pas le même, et un
// généraliste qui convoque « ses diabétiques » ne convoque pas les mêmes
// patients selon le type.
export const PATHOLOGIES_COURANTES: readonly string[] = [
  'Diabète type 2',
  'Hypertension artérielle',
  'Asthme',
  'Dyslipidémie',
  'Hypothyroïdie',
  'Obésité',
  'Diabète type 1',
  'Cardiopathie',
  'Insuffisance cardiaque',
  'Insuffisance rénale chronique',
  'BPCO',
  'Épilepsie',
  'Hyperthyroïdie',
  'Arthrose',
  'Polyarthrite rhumatoïde',
  'Rhumatisme articulaire aigu',
  'Reflux gastro-œsophagien',
  'Anémie chronique',
  'Drépanocytose',
  'Tuberculose',
  'Hépatite B',
  'Hépatite C',
  'Dépression',
  'Trouble anxieux',
  'Migraine',
  'Séquelles d\'AVC',
  'Cancer en suivi',
]

// Une étiquette ne dépasse pas quelques mots : au-delà, c'est une phrase
// clinique, et sa place est dans « Maladies chroniques ».
const MAX_LONGUEUR = 60
// Trente pathologies sur une même fiche, c'est une erreur de saisie, pas un
// patient. La borne protège aussi l'écran : la liste ne peut pas devenir un mur.
const MAX_ETIQUETTES = 20

/** Clé de comparaison : sans accent, sans casse, espaces normalisés.
 *
 *  LE PIÈGE DE LA LISTE OUVERTE : rien n'empêche de saisir « diabete type 2 »
 *  le lundi et « Diabète type 2 » le mardi. Deux étiquettes distinctes en base,
 *  deux lignes dans le filtre, et la moitié des diabétiques manquants dans
 *  chacune. Tout ce qui entre passe donc par cette clé. */
function cle(s: string): string {
  return s
    .normalize('NFD')
    // Échappements \u, et pas les signes diacritiques écrits tels quels : la
    // classe de caractères contiendrait alors des marques combinantes
    // invisibles, qu'un copier-coller ou un reformatage efface sans bruit — et
    // « Diabète » cesserait de rejoindre « diabete » sans que rien ne le dise.
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Index des étiquettes proposées, par clé de comparaison.
const PAR_CLE: Record<string, string> = {}
for (const p of PATHOLOGIES_COURANTES) PAR_CLE[cle(p)] = p

/** Une étiquette telle qu'on l'écrit en base.
 *
 *  Quand la saisie correspond à une pathologie proposée (aux accents et à la
 *  casse près), on écrit L'ORTHOGRAPHE DE LA LISTE : c'est ce qui garantit
 *  qu'« hypertension arterielle » tapé à la hâte rejoint bien la cohorte
 *  « Hypertension artérielle » déjà constituée. Sinon on garde la saisie du
 *  praticien, telle qu'il l'a écrite — c'est sa pathologie, pas la nôtre.
 *  Renvoie null si la saisie ne contient rien d'utilisable. */
export function normaliserEtiquette(brut: string): string | null {
  const propre = String(brut ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LONGUEUR)
  if (!propre) return null
  return PAR_CLE[cle(propre)] ?? propre
}

/** Assainit un ensemble d'étiquettes : normalisées, sans doublon (au sens de
 *  la clé, pas de la chaîne), et bornées. L'ordre de saisie est conservé. */
export function nettoyerEtiquettes(brut: unknown): string[] {
  const vues = new Set<string>()
  const out: string[] = []
  for (const v of Array.isArray(brut) ? brut : []) {
    const e = normaliserEtiquette(String(v))
    if (!e) continue
    const k = cle(e)
    if (vues.has(k)) continue
    vues.add(k)
    out.push(e)
    if (out.length >= MAX_ETIQUETTES) break
  }
  return out
}

/** Vrai si l'étiquette est déjà posée sur la fiche (comparaison à l'accent et
 *  à la casse près : sans ça le sélecteur proposerait d'ajouter un doublon). */
export function dejaPosee(etiquettes: readonly string[], candidate: string): boolean {
  const k = cle(candidate)
  return etiquettes.some((e) => cle(e) === k)
}

/** Les pathologies à proposer pendant la frappe : celles de la liste, plus
 *  celles que le praticien a déjà créées lui-même sur d'autres fiches — c'est
 *  la deuxième fois qu'il saisit « Lupus » qu'il ne doit pas la retaper. */
export function suggestions(saisie: string, deja: readonly string[], connues: readonly string[] = []): string[] {
  const q = cle(saisie)
  const vues = new Set<string>()
  const pool: string[] = []
  for (const p of [...PATHOLOGIES_COURANTES, ...connues]) {
    const k = cle(p)
    if (vues.has(k)) continue
    vues.add(k)
    pool.push(p)
  }
  return pool.filter((p) => !dejaPosee(deja, p) && (!q || cle(p).includes(q)))
}

/** Les étiquettes réellement portées par une patientèle, avec leur effectif,
 *  les plus nombreuses d'abord. C'est la liste du filtre : on ne propose que
 *  ce qui existe, sinon le médecin déroule vingt-sept pathologies pour en
 *  trouver trois utilisées. */
export function compterEtiquettes(
  patients: readonly { conditions?: string[] | null }[],
): { etiquette: string; nombre: number }[] {
  const compte: Record<string, { etiquette: string; nombre: number }> = {}
  for (const p of patients) {
    // Doublon possible sur une même fiche (données écrites avant cette
    // version, ou import) : on ne compte le patient qu'une fois par étiquette.
    const vues = new Set<string>()
    for (const e of p.conditions ?? []) {
      const k = cle(String(e))
      if (!k || vues.has(k)) continue
      vues.add(k)
      if (!compte[k]) compte[k] = { etiquette: PAR_CLE[k] ?? String(e).trim(), nombre: 0 }
      compte[k].nombre += 1
    }
  }
  return Object.values(compte).sort(
    (a, b) => b.nombre - a.nombre || a.etiquette.localeCompare(b.etiquette, 'fr', { sensitivity: 'base' }),
  )
}

/** Vrai si le patient porte cette étiquette — la comparaison du filtre, à
 *  l'accent et à la casse près pour les mêmes raisons que `dejaPosee`. */
export function porteEtiquette(conditions: string[] | null | undefined, etiquette: string): boolean {
  return dejaPosee(conditions ?? [], etiquette)
}
