// Logo du cabinet (migration v57) — constantes et règles partagées entre le
// navigateur (composant de téléversement) et le serveur (route, ordonnances,
// dossier PDF). Aucune dépendance Node ici : ce fichier part dans le bundle
// client. La validation du contenu du fichier, elle, vit dans
// lib/cabinet-logo-server.ts, parce qu'elle a besoin de zlib.
//
// ── POURQUOI PNG ET JPEG, ET PAS SVG NI WEBP ────────────────────────────────
//
// SVG : c'est du XML qui peut embarquer du script. Ouvert directement, ou un
// jour affiché autrement que par une balise <img>, il exécute ce qu'il
// contient. Un logo de cabinet n'a aucune raison de courir ce risque.
//
// WebP : les navigateurs l'affichent, mais pdfkit — qui produit l'export PDF
// du dossier patient (lib/dossier.ts) — ne sait lire que le JPEG et le PNG.
// Accepter le WebP, c'était un logo présent sur l'ordonnance à l'écran et
// absent du PDF, sans que le médecin comprenne pourquoi. On refuse donc à
// l'entrée plutôt que d'échouer en silence à la sortie.
//
// ── POURQUOI 1 Mo ET 2000 PIXELS ────────────────────────────────────────────
//
// Sur l'ordonnance, le logo est plafonné à 14 mm de haut environ. À 300 dpi,
// cela représente moins de 200 pixels : un logo de 2000 pixels de côté est
// déjà dix fois plus fin que ce que l'imprimante restituera. Un fichier de
// logo raisonnable pèse de 30 à 300 Ko ; 1 Mo laisse passer l'export brut
// d'un graphiste sans obliger le médecin à retoucher son fichier.
//
// Le plafond compte surtout pour l'export groupé des dossiers
// (app/api/dossier/bulk) : le logo est intégré dans CHAQUE PDF, jusqu'à 40
// patients par archive. Et la limite en pixels protège le serveur : un PNG
// transparent est décompressé en entier par pdfkit (4 octets par pixel), et
// la compression de PNG permet à un fichier de 1 Mo d'annoncer 15 000 × 15 000
// pixels — près d'un gigaoctet de mémoire, pour chaque PDF produit.

/** Dépôt Supabase Storage dédié, public en lecture (migration v57). */
export const LOGO_BUCKET = 'cabinet-logos'

/** Poids maximal accepté, en octets. Doit rester égal au `file_size_limit`
 *  posé sur le dépôt par la migration v57. */
export const LOGO_MAX_BYTES = 1024 * 1024

/** Côté maximal, en pixels, dans chaque dimension. */
export const LOGO_MAX_SIDE = 2000

/** Valeur de l'attribut `accept` du champ fichier. Simple confort : le
 *  navigateur filtre la boîte de dialogue, mais seul le serveur décide. */
export const LOGO_ACCEPT = 'image/png,image/jpeg'

/** Libellé affiché au médecin sous le bouton de téléversement. */
export const LOGO_CONSIGNE = 'PNG ou JPEG · 1 Mo maximum · 2000 pixels de côté au plus'

/**
 * Le chemin d'un logo est TOUJOURS `<id-du-médecin>/logo-<horodatage>.<ext>`.
 *
 * - Le dossier au nom du médecin cloisonne les fichiers : la route de
 *   téléversement le déduit de la session, jamais d'une valeur envoyée.
 * - Un nom nouveau à chaque envoi rend l'ancienne adresse caduque d'elle-même :
 *   aucun cache (navigateur, CDN) ne peut resservir l'ancien logo. C'est le
 *   défaut de la photo de profil, qui réécrit le même nom et doit accoler un
 *   `?t=` à son adresse pour contourner le cache.
 *
 * La même règle est tenue en base par la contrainte `doctors_logo_path_format`
 * (v57). La vérifier aussi ici évite de construire une adresse à partir d'une
 * valeur inattendue si la contrainte venait à être retirée.
 */
export function isLogoPathFor(doctorId: string, path: string | null | undefined): path is string {
  if (!path) return false
  const esc = doctorId.replace(/[^0-9a-f-]/gi, '')
  if (esc !== doctorId) return false
  return new RegExp(`^${esc}/logo-[0-9]{13}\\.(png|jpg)$`).test(path)
}

/** Construit le chemin de stockage d'un nouveau logo. */
export function newLogoPath(doctorId: string, ext: 'png' | 'jpg'): string {
  return `${doctorId}/logo-${Date.now()}.${ext}`
}
