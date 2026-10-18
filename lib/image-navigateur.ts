// Redimensionnement d'image DANS LE NAVIGATEUR, avant tout envoi.
//
// POURQUOI CÔTÉ NAVIGATEUR, ET PAS SUR LE SERVEUR
// Ce n'est pas le stockage qu'on économise — 5 photos brutes par cabinet font
// 2 Go pour cent cabinets, ce qui ne gêne personne. C'est l'ENVOI : une
// secrétaire qui téléverse cinq photos de 4 Mo depuis son téléphone en 4G
// attend longtemps, et un envoi sur deux échoue. Réencoder avant de partir
// fait tomber chaque photo à ~300 ko : c'est instantané, et le serveur n'a
// aucun travail d'image à faire.
//
// Effet de bord utile : quelle que soit l'image choisie — HEIC d'iPhone, PNG,
// capture d'écran — il en sort du JPEG. Le serveur n'a donc qu'un seul format
// à accepter.

/** `createImageBitmap` lit l'orientation EXIF quand on le lui demande. Sans
 *  `imageOrientation: 'from-image'`, les photos prises en portrait sur un
 *  téléphone arrivent couchées — le capteur enregistre en paysage et note la
 *  rotation à part, que le canvas ignore par défaut. */
async function charger(fichier: File): Promise<ImageBitmap> {
  return createImageBitmap(fichier, { imageOrientation: 'from-image' })
}

/**
 * Réduit une image à `maxSide` pixels dans sa plus grande dimension et la
 * réencode en JPEG.
 *
 * @returns un Blob JPEG, ou null si le navigateur n'a pas pu lire le fichier
 *          (format exotique, fichier corrompu) — l'appelant doit alors le
 *          refuser plutôt que d'envoyer l'original.
 */
export async function redimensionnerEnJpeg(
  fichier: File,
  maxSide: number,
  qualite: number
): Promise<Blob | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await charger(fichier)
  } catch {
    return null
  }

  try {
    const facteur = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    // Une image déjà petite n'est pas agrandie : on ne fabrique pas du pixel.
    const largeur = Math.max(1, Math.round(bitmap.width * facteur))
    const hauteur = Math.max(1, Math.round(bitmap.height * facteur))

    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur

    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // Un JPEG n'a pas de transparence : sans ce fond, les zones transparentes
    // d'un PNG deviennent noires au lieu de blanches.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, largeur, hauteur)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur)

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', qualite)
    })
  } finally {
    // Libère la mémoire du décodage : une photo de 12 Mpx occupe ~48 Mo une
    // fois décompressée, et cinq d'affilée suffisent à faire tomber l'onglet
    // d'un téléphone d'entrée de gamme.
    bitmap.close()
  }
}
