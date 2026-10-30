// L'IMAGERIE DENTAIRE — ce que l'écran et les routes partagent.
//
// ── CE QUE C'EST, ET CE QUE CE N'EST PAS ────────────────────────────────────
//
// Pas une capture. Un navigateur ne parle pas à un capteur intra-oral : le
// pilote est un composant Windows, et MonRDV est une application web. Ce
// module sert l'image DÉJÀ produite par le logiciel du capteur — pour qu'elle
// cesse de vivre dans un dossier Windows que personne ne retrouve trois ans
// plus tard, et qu'elle rejoigne la dent dont elle parle.
//
// ── POURQUOI UNE RADIO NE SE REDIMENSIONNE PAS ──────────────────────────────
//
// Les photos du cabinet sont réduites à 1600 px avant l'envoi : c'est de
// l'illustration. Une image de diagnostic, non. Perdre de la définition sur
// une rétro-alvéolaire, c'est perdre la lésion qu'on cherchait. L'original
// part tel quel, et le quota du cabinet est calculé en conséquence.

export interface TypeImage {
  cle: string
  label: string
  /** L'examen vise-t-il des dents précises ? Une panoramique les couvre
   *  toutes ; en lister trente-deux ne serait que du bruit. */
  cible: boolean
  aide: string
}

export const TYPES_IMAGE: TypeImage[] = [
  { cle: 'retro',       label: 'Rétro-alvéolaire', cible: true,  aide: 'Une à trois dents, racine comprise' },
  { cle: 'bitewing',    label: 'Bitewing',         cible: true,  aide: 'Rétro-coronaire : les caries interproximales' },
  { cle: 'occlusale',   label: 'Occlusale',        cible: true,  aide: 'Vue du plan occlusal' },
  { cle: 'panoramique', label: 'Panoramique',      cible: false, aide: 'Les deux arcades d’un coup' },
  { cle: 'teleradio',   label: 'Téléradiographie', cible: false, aide: 'Profil, céphalométrie' },
  { cle: 'photo',       label: 'Photo clinique',   cible: true,  aide: 'Intra-orale ou de face' },
  { cle: 'autre',       label: 'Autre image',      cible: true,  aide: '' },
]

export function typeImage(cle?: string | null): TypeImage | null {
  if (!cle) return null
  return TYPES_IMAGE.find((t) => t.cle === cle) ?? null
}

export function libelleType(cle?: string | null): string {
  return typeImage(cle)?.label ?? 'Image'
}

export interface ImageDentaire {
  id: string
  file_path: string
  file_name: string
  file_type?: string | null
  file_size?: number | null
  created_at: string
  dents?: string[] | null
  type_image?: string | null
  date_examen?: string | null
}

/** Un document est une image d'imagerie DENTAIRE dès qu'il porte un type.
 *  Sans type, c'est une pièce administrative comme une autre : elle reste
 *  dans les documents du dossier et n'encombre pas l'odontogramme. */
export function estImagerie(d: ImageDentaire): boolean {
  return !!d.type_image
}

/** Le jour qui fait foi dans la chronologie clinique, et s'il est CERTAIN.
 *
 *  La date d'examen manque sur toute image importée avant la v94, et sur
 *  celles qu'on dépose sans la saisir. On se rabat alors sur la date d'envoi
 *  — une borne haute : l'examen a forcément eu lieu avant — et l'écran
 *  l'annonce plutôt que d'afficher un jour faux. */
export function jourImage(d: ImageDentaire): { jour: string; estime: boolean } {
  const examen = (d.date_examen ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(examen)) return { jour: examen, estime: false }
  return { jour: (d.created_at ?? '').slice(0, 10), estime: true }
}

/** Les images d'une dent, de la plus récente à la plus ancienne.
 *
 *  Une panoramique ne cite aucune dent mais les montre toutes : elle remonte
 *  donc pour n'importe quelle dent, sinon on la chercherait ailleurs alors
 *  qu'elle répond à la question posée. */
export function imagesDeLaDent(images: ImageDentaire[], dent: string): ImageDentaire[] {
  return images
    .filter(estImagerie)
    .filter((d) => {
      const t = typeImage(d.type_image)
      if (t && !t.cible) return true
      return (d.dents ?? []).includes(dent)
    })
    .sort((a, b) => jourImage(b).jour.localeCompare(jourImage(a).jour))
}

/** Les dents qui portent au moins une image CIBLÉE. Les panoramiques en sont
 *  exclues : elles marqueraient les trente-deux dents, et un repère qui
 *  s'allume partout ne signale plus rien. */
export function dentsAvecImage(images: ImageDentaire[]): Set<string> {
  const s = new Set<string>()
  for (const d of images) {
    if (!estImagerie(d)) continue
    const t = typeImage(d.type_image)
    if (t && !t.cible) continue
    for (const n of d.dents ?? []) s.add(n)
  }
  return s
}

/** Deux images de la même dent se comparent-elles utilement ? Il faut deux
 *  dates DIFFÉRENTES : comparer une image avec elle-même, ou deux clichés du
 *  même jour, ne montre aucune évolution. */
export function comparableSurLaDent(images: ImageDentaire[], dent: string): boolean {
  const jours = new Set(imagesDeLaDent(images, dent).map((d) => jourImage(d).jour))
  return jours.size >= 2
}

export function poidsLisible(octets?: number | null): string {
  if (!octets || octets <= 0) return ''
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}
