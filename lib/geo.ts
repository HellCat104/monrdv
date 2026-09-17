// Coordonnées GPS d'un cabinet à partir de ce que le médecin sait fournir.
//
// Personne ne connaît la latitude de son cabinet. En revanche, tout le monde
// sait appuyer sur « Partager » dans Google Maps depuis son téléphone. C'est
// donc ce lien que l'on accepte — sous toutes ses formes — plutôt que deux
// champs de chiffres qu'aucun praticien ne remplirait.

export interface Coordonnees {
  latitude: number
  longitude: number
}

/** Bornes terrestres, et rejet du « point nul » (0,0), au large du Ghana. */
function valider(lat: number, lng: number): Coordonnees | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (lat === 0 && lng === 0) return null
  // Six décimales : une dizaine de centimètres. Au-delà, c'est du bruit, et la
  // colonne est en numeric(9,6) — autant arrondir ici plutôt que laisser la
  // base refuser l'écriture.
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) }
}

const NOMBRE = '(-?\\d{1,3}(?:\\.\\d+)?)'

/**
 * Extrait des coordonnées d'un lien Google Maps, d'un lien OpenStreetMap, ou
 * d'un couple de chiffres collé tel quel.
 *
 * Ne suit AUCUNE redirection : les liens courts (maps.app.goo.gl) sont résolus
 * côté serveur par /api/geo/resoudre, seul endroit autorisé à sortir sur le
 * réseau, et avec une liste blanche de domaines.
 */
export function extraireCoordonnees(texte: string): Coordonnees | null {
  const t = (texte ?? '').trim()
  if (!t) return null

  // 1. !3d<lat>!4d<lng> — la position EXACTE du lieu dans les URL longues de
  //    Google Maps. À privilégier sur le `@…`, qui n'est que le centre de la
  //    carte affichée : sur un écran de téléphone, l'écart atteint facilement
  //    plusieurs centaines de mètres.
  const precis = t.match(new RegExp(`!3d${NOMBRE}!4d${NOMBRE}`))
  if (precis) {
    const c = valider(parseFloat(precis[1]), parseFloat(precis[2]))
    if (c) return c
  }

  // 2. Paramètres d'URL usuels : ?q= / ?ll= / ?daddr= / #map=zoom/lat/lng (OSM)
  const parametre = t.match(new RegExp(`[?&](?:q|ll|daddr|center|sll|mlat)=${NOMBRE},${NOMBRE}`))
  if (parametre) {
    const c = valider(parseFloat(parametre[1]), parseFloat(parametre[2]))
    if (c) return c
  }
  const osm = t.match(new RegExp(`#map=\\d+/${NOMBRE}/${NOMBRE}`))
  if (osm) {
    const c = valider(parseFloat(osm[1]), parseFloat(osm[2]))
    if (c) return c
  }

  // 3. @<lat>,<lng> — le centre de la carte. Moins précis, mais c'est la forme
  //    la plus répandue quand on copie l'URL depuis la barre d'adresse.
  const arobase = t.match(new RegExp(`@${NOMBRE},${NOMBRE}`))
  if (arobase) {
    const c = valider(parseFloat(arobase[1]), parseFloat(arobase[2]))
    if (c) return c
  }

  // 4. Coordonnées collées telles quelles : « 34.020882, -6.841650 ».
  //    Ancré aux deux bouts : sans cela, on irait piocher deux nombres au
  //    hasard dans une phrase ou une adresse postale.
  const brut = t.match(new RegExp(`^${NOMBRE}\\s*[,;]\\s*${NOMBRE}$`))
  if (brut) {
    const c = valider(parseFloat(brut[1]), parseFloat(brut[2]))
    if (c) return c
  }

  return null
}

/**
 * Domaines dont on accepte de suivre une redirection.
 *
 * Cette liste est une protection, pas une commodité : la route qui résout les
 * liens courts part sur le réseau depuis NOTRE serveur, avec nos accès. Sans
 * liste blanche, il suffirait d'y coller une adresse interne pour la faire
 * interroger à notre place.
 */
const DOMAINES_AUTORISES = [
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'g.co',
  'openstreetmap.org',
  'www.openstreetmap.org',
  'osm.org',
]

/** Le lien est-il un lien de carte que l'on accepte d'aller résoudre ? */
export function lienCarteAutorise(url: string): boolean {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return DOMAINES_AUTORISES.includes(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Adresse à ouvrir quand le patient clique sur « Y aller ».
 *
 * Trois sources, de la plus fiable à la plus approximative :
 *   1. les coordonnées — l'itinéraire vise le cabinet au mètre près ;
 *   2. le lien de carte enregistré par le médecin — une fiche de lieu Google,
 *      qui s'ouvre directement dans l'application du patient ;
 *   3. l'adresse écrite — Google la cherche, avec le risque d'ambiguïté d'une
 *      rue portant le même nom dans deux quartiers. Mieux que rien.
 *
 * La VILLE SEULE ne compte pas comme une source. Un itinéraire vers « Rabat »
 * dépose le patient au centre-ville, à plusieurs kilomètres du cabinet : c'est
 * pire qu'une absence de bouton, parce qu'il croit avoir été guidé. La ville ne
 * sert donc qu'à lever l'ambiguïté d'une adresse, jamais à la remplacer.
 *
 * Renvoie null si le cabinet n'a rien de tout cela : le bouton disparaît
 * plutôt que d'envoyer le patient au mauvais endroit.
 */
export function lienItineraire(opts: {
  latitude?: number | null
  longitude?: number | null
  mapUrl?: string | null
  address?: string | null
  city?: string | null
}): string | null {
  const { latitude, longitude, mapUrl, address, city } = opts

  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
  }

  // On ne rouvre pas n'importe quoi : même liste blanche qu'à l'enregistrement.
  // Une valeur douteuse arrivée en base par un autre chemin ne doit pas devenir
  // un lien cliquable sur une page publique.
  if (mapUrl && lienCarteAutorise(mapUrl)) return mapUrl

  // Pas d'adresse de rue : rien à viser. On s'arrête ici.
  if (!address || !address.trim()) return null

  const ecrite = [address.trim(), city?.trim()].filter(Boolean).join(', ')
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ecrite)}`
}
