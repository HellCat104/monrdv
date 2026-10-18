// Photos du cabinet (migration v74) — constantes et règles de chemin,
// partagées entre le navigateur et le serveur. Aucune dépendance Node : ce
// fichier part dans le bundle client.
//
// ── POURQUOI CINQ ───────────────────────────────────────────────────────────
//
// Au-delà, personne ne regarde, et la fiche devient une galerie au lieu d'une
// page de réservation. Cinq suffisent à montrer la façade, la salle d'attente,
// le fauteuil et l'équipement — c'est ce qu'un patient veut voir avant un
// premier rendez-vous, et ce qu'aucune fiche d'annuaire ne montre.
//
// ── POURQUOI JPEG SEULEMENT ─────────────────────────────────────────────────
//
// Le navigateur réencode systématiquement avant l'envoi : le serveur ne reçoit
// jamais autre chose. Le médecin peut donc choisir n'importe quoi dans sa
// pellicule — HEIC d'iPhone, PNG, image de 12 Mpx — et ça marche. Le SVG, lui,
// n'est jamais accepté : c'est du XML qui peut embarquer du script.
//
// ── POURQUOI 1600 PIXELS ────────────────────────────────────────────────────
//
// La plus grande largeur servie par next/image est 1080 (deviceSizes dans
// next.config.js). 1600 laisse donc une marge confortable sans stocker du
// pixel que personne ne verra jamais. Une photo de téléphone passe ainsi de
// ~4 Mo à ~300 ko : l'envoi devient instantané en 4G, ce qui est le vrai
// argument — le stockage, lui, n'était un problème dans aucun des deux cas.

/** Dépôt Supabase Storage dédié, public en lecture (migration v74). */
export const PHOTOS_BUCKET = 'cabinet-photos'

/** Nombre maximal de photos par cabinet. Tenu aussi par le trigger v74. */
export const PHOTOS_MAX = 5

/** Poids maximal accepté par photo, en octets. Doit rester égal au
 *  `file_size_limit` posé sur le dépôt par la v74. C'est un FILET : après
 *  redimensionnement une photo pèse de 200 à 400 ko. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024

/** Côté maximal après redimensionnement, en pixels. */
export const PHOTO_MAX_SIDE = 1600

/** Qualité JPEG du réencodage. 0,82 est le point où l'œil ne distingue plus
 *  la perte alors que le poids a déjà fondu. */
export const PHOTO_QUALITE = 0.82

/** Attribut `accept` du champ fichier : confort de sélection seulement, le
 *  navigateur réencode ensuite et le serveur décide. */
export const PHOTO_ACCEPT = 'image/*'

export const PHOTO_CONSIGNE =
  `${PHOTOS_MAX} photos au maximum · redimensionnées automatiquement · la première est la photo mise en avant`

/**
 * Le chemin d'une photo est TOUJOURS `<id-du-médecin>/photo-<horodatage>-<n>.jpg`.
 *
 * - Le dossier au nom du médecin cloisonne les fichiers : la route le déduit
 *   de la session, jamais d'une valeur envoyée.
 * - Un nom nouveau à chaque envoi rend l'ancienne adresse caduque : aucun
 *   cache (navigateur, CDN) ne peut resservir une photo remplacée.
 * - Le suffixe `-<n>` distingue deux photos envoyées dans la même
 *   milliseconde, ce qui arrive dès qu'on en sélectionne plusieurs d'un coup.
 *
 * La même règle est tenue en base par le trigger `protect_doctor_photos`.
 */
export function isPhotoPathFor(doctorId: string, path: string | null | undefined): path is string {
  if (!path) return false
  const esc = doctorId.replace(/[^0-9a-f-]/gi, '')
  if (esc !== doctorId) return false
  return new RegExp(`^${esc}/photo-[0-9]{13}-[0-9]+\\.jpg$`).test(path)
}

/** Construit le chemin de stockage d'une nouvelle photo. */
export function newPhotoPath(doctorId: string, n: number): string {
  return `${doctorId}/photo-${Date.now()}-${Math.max(0, Math.floor(n))}.jpg`
}

/** Ne garde que les chemins valides pour CE médecin, dans la limite de cinq.
 *  Utilisé des deux côtés : la route avant d'écrire, la fiche publique avant
 *  d'afficher — une valeur inattendue en base ne doit pas produire une image
 *  cassée ni une adresse construite n'importe comment. */
export function photosValides(doctorId: string, photos: unknown): string[] {
  if (!Array.isArray(photos)) return []
  return photos.filter((p): p is string => isPhotoPathFor(doctorId, p)).slice(0, PHOTOS_MAX)
}
