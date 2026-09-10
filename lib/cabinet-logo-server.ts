// Logo du cabinet (migration v57) — tout ce qui ne peut s'exécuter que sur le
// serveur : l'examen du contenu du fichier, la lecture du logo pour les
// ordonnances et son chargement pour le dossier PDF.
//
// ── POURQUOI ON LIT LE FICHIER OCTET PAR OCTET ──────────────────────────────
//
// Le type annoncé par le navigateur (`file.type`) n'est que l'extension du
// nom de fichier, traduite : renommer « logo.svg » en « logo.png » suffit à le
// changer. Seuls les premiers octets disent ce qu'est vraiment le fichier. Et
// même un en-tête PNG valide ne garantit pas une image lisible : un PNG
// tronqué s'affiche à moitié dans le navigateur, mais fait lever à pdfkit une
// exception dans un rappel asynchrone de zlib — hors de toute portée d'un
// try/catch, ce qui fait tomber la fonction serveur qui génère le dossier.
// On décompresse donc l'image une fois, ici, de façon synchrone et encadrée,
// avant de l'accepter ; et on refait le même examen avant chaque intégration
// dans un PDF.
//
// ── POURQUOI ON RÉÉCRIT LES PNG ─────────────────────────────────────────────
//
// Un PNG transporte, à côté de l'image, des blocs de texte libres (auteur,
// logiciel, commentaires, parfois des coordonnées) et tolère n'importe quelles
// données après sa fin. On ne stocke que les blocs nécessaires à l'affichage :
// l'en-tête, la palette, la transparence, la colorimétrie et les pixels. Les
// métadonnées disparaissent, et un fichier « polyglotte » (PNG valide suivi
// d'une archive ou d'un script) perd tout ce qui n'est pas l'image.
//
// Pour le JPEG, on se contente de couper ce qui suit le marqueur de fin
// d'image : ses métadonnées EXIF portent aussi l'orientation, et les retirer
// ferait pivoter certains logos.

import zlib from 'zlib'
import { createAdminClient, type createClient } from '@/lib/supabase/server'
import { LOGO_BUCKET, LOGO_MAX_BYTES, LOGO_MAX_SIDE, isLogoPathFor } from '@/lib/cabinet-logo'

type Supabase = ReturnType<typeof createClient>

export type LogoCheck =
  | {
      ok: true
      ext: 'png' | 'jpg'
      contentType: 'image/png' | 'image/jpeg'
      width: number
      height: number
      /** Le fichier à stocker : PNG réécrit, ou JPEG coupé à sa fin d'image. */
      data: Buffer
    }
  | { ok: false; error: string }

const ENDOMMAGE = 'Ce fichier est incomplet ou endommagé. Réexportez votre logo depuis votre logiciel, en PNG ou en JPEG.'

/**
 * Examine le contenu réel d'un fichier de logo. Ne se fie ni au nom, ni au
 * type annoncé : seuls les octets comptent.
 */
export function checkLogoImage(buf: Buffer): LogoCheck {
  if (buf.length === 0) return { ok: false, error: 'Le fichier est vide.' }
  if (buf.length > LOGO_MAX_BYTES) {
    return { ok: false, error: `Le logo pèse ${(buf.length / 1024 / 1024).toFixed(1)} Mo : 1 Mo au maximum. Réduisez sa taille en pixels avant de l'envoyer.` }
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return checkPng(buf)
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return checkJpeg(buf)
  return { ok: false, error: formatRefuse(buf) }
}

/** Message adapté au format reconnu : « ce n'est pas une image » n'aide pas
 *  le médecin qui a envoyé, en toute bonne foi, le SVG de son graphiste. */
function formatRefuse(buf: Buffer): string {
  const ascii = (a: number, b: number) => buf.toString('latin1', a, b)
  // Un SVG est du texte qui commence par une balise (éventuellement précédée
  // d'une marque d'ordre des octets et d'espaces) : on refuse tout fichier
  // texte à balises, SVG, XML ou HTML, sans chercher à les distinguer.
  const debut = buf.subarray(0, 256).toString('utf8').replace(/^\uFEFF/, '').trimStart()
  if (debut.startsWith('<')) {
    return 'Le format SVG n\'est pas accepté : un fichier SVG peut contenir du code. Exportez votre logo en PNG (fond transparent possible) ou en JPEG.'
  }
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'Le format WebP n\'est pas accepté : il ne peut pas figurer dans les dossiers PDF. Exportez votre logo en PNG ou en JPEG.'
  }
  if (buf.length >= 6 && ascii(0, 4) === 'GIF8') {
    return 'Le format GIF n\'est pas accepté. Exportez votre logo en PNG ou en JPEG.'
  }
  if (buf.length >= 12 && ascii(4, 8) === 'ftyp') {
    return 'Ce format (HEIC, photo d\'iPhone…) n\'est pas accepté. Exportez votre logo en PNG ou en JPEG.'
  }
  return 'Ce fichier n\'est pas une image PNG ou JPEG, quel que soit son nom. Exportez votre logo en PNG ou en JPEG.'
}

function tailleRefusee(width: number, height: number): string | null {
  if (width === 0 || height === 0) return ENDOMMAGE
  if (width > LOGO_MAX_SIDE || height > LOGO_MAX_SIDE) {
    return `Votre logo mesure ${width} × ${height} pixels : ${LOGO_MAX_SIDE} pixels de côté au maximum. Réduisez-le, il restera parfaitement net à l'impression.`
  }
  return null
}

// ── PNG ─────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Blocs conservés à la réécriture. Les quatre en majuscule sont indispensables
// à l'image ; les autres portent la transparence et la colorimétrie, sans
// lesquelles le logo changerait de teinte ou perdrait son fond transparent.
const BLOCS_CONSERVES = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'pHYs'])

// Profondeurs autorisées par la norme PNG pour chaque type de couleur, et
// nombre de composantes par pixel (0 gris, 2 RVB, 3 palette, 4 gris+alpha,
// 6 RVB+alpha).
const PROFONDEURS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
const COMPOSANTES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

// Entrelacement Adam7 : sept passes, chacune avec son origine et son pas.
const ADAM7: [number, number, number, number][] = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
]

function checkPng(buf: Buffer): LogoCheck {
  const blocs: Buffer[] = [PNG_SIGNATURE]
  const idat: Buffer[] = []
  let entete: { width: number; height: number; bits: number; couleur: number; entrelace: boolean } | null = null
  let palette = false
  let fin = false
  let pos = 8

  while (pos + 12 <= buf.length) {
    const longueur = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    const suivant = pos + 12 + longueur
    if (suivant > buf.length) return { ok: false, error: ENDOMMAGE }
    const data = buf.subarray(pos + 8, pos + 8 + longueur)

    // L'en-tête doit venir en premier, et une seule fois.
    if ((entete === null) !== (type === 'IHDR')) return { ok: false, error: ENDOMMAGE }

    if (type === 'IHDR') {
      if (longueur !== 13) return { ok: false, error: ENDOMMAGE }
      entete = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bits: data[8], couleur: data[9], entrelace: data[12] === 1,
      }
      // Compression et filtrage : la norme ne connaît que la méthode 0.
      if (data[10] !== 0 || data[11] !== 0 || data[12] > 1) return { ok: false, error: ENDOMMAGE }
      if (!PROFONDEURS[entete.couleur]?.includes(entete.bits)) return { ok: false, error: ENDOMMAGE }
      const refus = tailleRefusee(entete.width, entete.height)
      if (refus) return { ok: false, error: refus }
    } else if (type === 'PLTE') {
      palette = true
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'acTL') {
      // PNG animé : le navigateur l'animerait sur l'écran de l'ordonnance.
      return { ok: false, error: 'Les logos animés ne sont pas acceptés. Exportez une image fixe, en PNG ou en JPEG.' }
    } else if (/^[A-Z]/.test(type) && !BLOCS_CONSERVES.has(type)) {
      // Bloc « critique » inconnu (ex. les PNG optimisés pour iPhone) : la
      // norme impose de refuser l'image plutôt que de l'afficher faussée.
      return { ok: false, error: ENDOMMAGE }
    }

    if (BLOCS_CONSERVES.has(type)) blocs.push(buf.subarray(pos, suivant))
    pos = suivant
    if (type === 'IEND') { fin = true; break }
  }

  if (!entete || !fin || idat.length === 0) return { ok: false, error: ENDOMMAGE }
  if (entete.couleur === 3 && !palette) return { ok: false, error: ENDOMMAGE }

  // Taille exacte des pixels décompressés : un octet de filtre par ligne, plus
  // les pixels de la ligne — passe par passe si l'image est entrelacée.
  const bitsParPixel = COMPOSANTES[entete.couleur] * entete.bits
  const passes: [number, number][] = entete.entrelace
    ? ADAM7.map(([x0, y0, dx, dy]) => [
        Math.max(0, Math.ceil((entete!.width - x0) / dx)),
        Math.max(0, Math.ceil((entete!.height - y0) / dy)),
      ])
    : [[entete.width, entete.height]]
  let attendu = 0
  for (const [w, h] of passes) if (w > 0 && h > 0) attendu += h * (1 + Math.ceil((w * bitsParPixel) / 8))

  // maxOutputLength : une image qui se décompresse en plus que ce qu'annonce
  // son en-tête est refusée sans que la mémoire n'explose.
  let pixels: Buffer
  try {
    pixels = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: attendu })
  } catch {
    return { ok: false, error: ENDOMMAGE }
  }
  if (pixels.length !== attendu) return { ok: false, error: ENDOMMAGE }

  // Chaque ligne commence par un type de filtre, de 0 à 4. Une autre valeur
  // est précisément ce qui fait lever pdfkit hors de tout try/catch.
  let p = 0
  for (const [w, h] of passes) {
    if (w === 0 || h === 0) continue
    const ligne = 1 + Math.ceil((w * bitsParPixel) / 8)
    for (let y = 0; y < h; y++, p += ligne) {
      if (pixels[p] > 4) return { ok: false, error: ENDOMMAGE }
    }
  }

  return {
    ok: true, ext: 'png', contentType: 'image/png',
    width: entete.width, height: entete.height,
    data: Buffer.concat(blocs),
  }
}

// ── JPEG ────────────────────────────────────────────────────────────────────

function checkJpeg(buf: Buffer): LogoCheck {
  let image: { bits: number; width: number; height: number; composantes: number } | null = null
  let debutDonnees = -1
  let pos = 2

  // Parcours des segments jusqu'au début des données compressées (SOS).
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return { ok: false, error: ENDOMMAGE }
    const marqueur = buf[pos + 1]
    if (marqueur === 0xff) { pos++; continue }            // octet de remplissage
    pos += 2
    if (marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd8)) continue // marqueurs sans longueur
    if (marqueur === 0xd9) return { ok: false, error: ENDOMMAGE }             // fin avant l'image
    const longueur = buf.readUInt16BE(pos)
    if (longueur < 2 || pos + longueur > buf.length) return { ok: false, error: ENDOMMAGE }

    // Début d'image (SOF). C4, C8 et CC sont des tables, pas des images.
    if (marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
      if (image) return { ok: false, error: ENDOMMAGE }
      // Seuls les codages de base et progressif (C0 à C2) sont lus partout —
      // navigateurs, pdfkit, lecteurs PDF. Les autres (arithmétique, sans
      // perte) s'afficheraient ici et pas là.
      if (marqueur > 0xc2) {
        return { ok: false, error: 'Ce JPEG utilise un codage peu répandu que certains lecteurs n\'affichent pas. Réenregistrez-le en JPEG standard ou en PNG.' }
      }
      if (longueur < 8) return { ok: false, error: ENDOMMAGE }
      image = {
        bits: buf[pos + 2],
        height: buf.readUInt16BE(pos + 3),
        width: buf.readUInt16BE(pos + 5),
        composantes: buf[pos + 7],
      }
    }
    if (marqueur === 0xda) { debutDonnees = pos + longueur; break }
    pos += longueur
  }

  if (!image || debutDonnees < 0) return { ok: false, error: ENDOMMAGE }
  // 8 bits par composante : le seul que le format PDF accepte pour un JPEG.
  // 1, 3 ou 4 composantes : gris, couleur, CMJN d'imprimeur.
  if (image.bits !== 8 || ![1, 3, 4].includes(image.composantes)) return { ok: false, error: ENDOMMAGE }
  const refus = tailleRefusee(image.width, image.height)
  if (refus) return { ok: false, error: refus }

  // Fin d'image : le premier FF D9 après les données. Dans les données
  // compressées, un octet FF est toujours suivi de 00 ou d'un marqueur de
  // reprise (D0-D7) : ce premier FF D9 est donc bien la fin de l'image. Ce qui
  // suit (seconde image d'un appareil photo, archive accolée) est coupé.
  const eoi = buf.indexOf(JPEG_FIN, debutDonnees)
  if (eoi < 0) return { ok: false, error: ENDOMMAGE }

  return {
    ok: true, ext: 'jpg', contentType: 'image/jpeg',
    width: image.width, height: image.height,
    data: buf.subarray(0, eoi + 2),
  }
}

const JPEG_FIN = Buffer.from([0xff, 0xd9])

// ── Lecture pour les documents ──────────────────────────────────────────────

/**
 * Chemin du logo d'un médecin, ou null s'il n'en a pas.
 *
 * Lu À PART de la fiche, jamais ajouté aux projections existantes : tant que
 * la migration v57 n'est pas passée, une colonne absente dans le `select` de
 * l'ordonnance ferait échouer toute la requête, et l'ordonnance tomberait en
 * 404 pour tous les médecins. Ici, une erreur retire simplement le logo —
 * même précaution que pour la liste d'attente dans app/[slug]/page.tsx.
 */
async function readLogoPath(supabase: Supabase, doctorId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('doctors').select('logo_path').eq('id', doctorId).maybeSingle()
  if (error) {
    // 42703 : colonne inexistante — la migration v57 n'est pas encore passée.
    console.error(
      error.code === '42703' || error.code === 'PGRST204'
        ? '[Logo cabinet] colonne logo_path absente : migration v57 à passer.'
        : `[Logo cabinet] lecture impossible : ${error.message}`,
    )
    return null
  }
  const path = (data as { logo_path?: string | null } | null)?.logo_path ?? null
  if (!path) return null
  // Défense en profondeur : la contrainte v57 tient déjà cette règle en base.
  if (!isLogoPathFor(doctorId, path)) {
    console.error(`[Logo cabinet] chemin inattendu ignoré pour le médecin ${doctorId}`)
    return null
  }
  return path
}

/** Adresse publique du logo, pour les documents rendus en HTML. */
export async function getCabinetLogoUrl(supabase: Supabase, doctorId: string): Promise<string | null> {
  const path = await readLogoPath(supabase, doctorId)
  if (!path) return null
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Octets du logo, prêts pour pdfkit — ou null s'il n'y a pas de logo, ou s'il
 * est illisible. Un logo manquant ne doit jamais empêcher l'export d'un
 * dossier médical : on journalise, et le PDF sort sans logo.
 *
 * Le fichier est réexaminé avant chaque intégration (voir en tête de fichier :
 * pdfkit n'a pas le droit à l'erreur). Seul le serveur écrit dans ce dépôt,
 * après ce même examen ; le refaire coûte quelques millisecondes et couvre un
 * fichier déposé à la main dans la console Supabase.
 */
export async function loadCabinetLogoForPdf(supabase: Supabase, doctorId: string): Promise<Buffer | null> {
  const path = await readLogoPath(supabase, doctorId)
  if (!path) return null
  // Client admin : le dépôt n'accorde aucun droit aux comptes connectés (v57),
  // et la lecture par l'adresse publique dépendrait du réseau et du CDN.
  const { data: blob, error } = await createAdminClient().storage.from(LOGO_BUCKET).download(path)
  if (error || !blob) {
    console.error(`[Logo cabinet] téléchargement impossible (${path}) :`, error?.message ?? 'fichier vide')
    return null
  }
  const verdict = checkLogoImage(Buffer.from(await blob.arrayBuffer()))
  if (!verdict.ok) {
    console.error(`[Logo cabinet] fichier refusé pour le PDF (${path}) : ${verdict.error}`)
    return null
  }
  return verdict.data
}
