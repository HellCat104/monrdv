// API : transforme un lien Google Maps en coordonnées GPS.
//
// Le médecin colle ce que son téléphone lui a donné — presque toujours un lien
// court du type https://maps.app.goo.gl/XXXX, qui ne contient aucune
// coordonnée. Seul un serveur peut le suivre jusqu'à l'URL longue : le
// navigateur s'y heurterait à la politique d'origine croisée.
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

  // Le lien contient déjà les coordonnées (URL longue, ou chiffres collés) :
  // inutile de sortir sur le réseau.
  const direct = extraireCoordonnees(texte)
  if (direct) return NextResponse.json(direct)

  // Sinon, il faut suivre la redirection. Liste blanche obligatoire : sans
  // elle, n'importe quelle adresse collée ici serait interrogée par notre
  // serveur, avec ses accès — y compris des adresses internes.
  const url = texte.match(/https?:\/\/\S+/)?.[0]
  if (!url || !lienCarteAutorise(url)) {
    return NextResponse.json(
      { error: "Ce lien n'est pas reconnu. Copiez celui du bouton « Partager » de Google Maps." },
      { status: 400 })
  }

  try {
    // `redirect: 'follow'` : c'est précisément la redirection qui nous
    // intéresse — l'URL d'arrivée porte les coordonnées. Délai borné : un lien
    // qui ne répond pas ne doit pas immobiliser la fonction.
    const rep = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MonRDV/1.0)' },
    })

    // D'abord l'URL finale, puis le corps de la page : certains liens courts
    // arrivent sur une page intermédiaire qui ne porte les coordonnées que
    // dans son HTML.
    const coords =
      extraireCoordonnees(rep.url) ??
      extraireCoordonnees((await rep.text()).slice(0, 200_000))

    if (!coords) {
      return NextResponse.json(
        { error: "Coordonnées introuvables dans ce lien. Ouvrez-le dans Google Maps, puis copiez l'adresse complète de la barre du navigateur." },
        { status: 422 })
    }
    return NextResponse.json(coords)
  } catch (e) {
    console.error('[géolocalisation] lien non résolu :', e)
    return NextResponse.json(
      { error: 'Le lien n\'a pas pu être ouvert. Réessayez.' },
      { status: 502 })
  }
}
