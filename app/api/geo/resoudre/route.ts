// API : interprète le lien de carte collé par le médecin.
//
// Elle renvoie DEUX choses, et la seconde est facultative :
//   • `mapUrl`   — le lien retenu, qui alimentera le bouton « Y aller » du
//                  patient. C'est le résultat principal, et il aboutit pour
//                  tout lien de carte valide.
//   • `latitude` / `longitude` — la position exacte, quand elle est lisible.
//                  Elle alimente le balisage schema.org `geo` pour Google.
//
// Cette distinction n'est pas un détail. Un lien partagé depuis une FICHE DE
// LIEU porte la position exacte ; partagé depuis un RÉSULTAT DE RECHERCHE, il
// n'aboutit qu'à « ?q=Nom du lieu&ftid=… », et la page servie à un serveur sans
// JavaScript ne contient que le centre de la ville. Refuser ces liens-là
// priverait le patient de son itinéraire pour une exigence — la coordonnée —
// dont l'itinéraire n'a nul besoin.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extraireCoordonnees, lienCarteAutorise } from '@/lib/geo'

export async function POST(req: NextRequest) {
  // Route authentifiée : elle fait sortir notre serveur sur le réseau, elle
  // n'a donc pas à être ouverte à tout venant.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { lien } = await req.json().catch(() => ({ lien: '' }))
  const texte = typeof lien === 'string' ? lien.trim().slice(0, 2000) : ''
  if (!texte) {
    return NextResponse.json({ error: 'Collez le lien de votre cabinet.' }, { status: 400 })
  }

  // Cas 1 — le lien porte déjà ses coordonnées, ou le médecin les a collées
  // telles quelles. Rien à aller chercher.
  const direct = extraireCoordonnees(texte)
  const url = texte.match(/https?:\/\/\S+/)?.[0] ?? null

  if (direct) {
    return NextResponse.json({
      mapUrl: url && lienCarteAutorise(url) ? url : null,
      latitude: direct.latitude,
      longitude: direct.longitude,
    })
  }

  // Cas 2 — il faut suivre la redirection. Liste blanche obligatoire : sans
  // elle, n'importe quelle adresse collée ici serait interrogée par notre
  // serveur, avec ses accès — y compris des adresses internes.
  if (!url || !lienCarteAutorise(url)) {
    return NextResponse.json(
      { error: "Ce lien n'est pas reconnu. Copiez celui du bouton « Partager » de Google Maps." },
      { status: 400 })
  }

  let coords: { latitude: number; longitude: number } | null = null
  try {
    const rep = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MonRDV/1.0)' },
    })
    // L'URL d'arrivée d'abord : sur un lien de fiche de lieu, elle porte la
    // position exacte (…!3d31.62!4d-8.02). Le corps de la page n'est PAS
    // fouillé : sur un lien de recherche, la seule coordonnée qu'il contienne
    // est le centre de la ville, et publier ça reviendrait à placer tous les
    // cabinets d'une même ville au même endroit.
    coords = extraireCoordonnees(rep.url)
  } catch (e) {
    // Échec réseau : le lien reste valide et utilisable pour l'itinéraire.
    console.error('[géolocalisation] lien non suivi :', e)
  }

  return NextResponse.json({
    mapUrl: url,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  })
}
