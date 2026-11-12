// GET /api/sante — « le site répond-il ? »
//
// Deux usages, un aujourd'hui et un demain.
//
// AUJOURD'HUI (Vercel). Une fonction qui n'a pas servi depuis quelques minutes
// s'endort, et la visite suivante attend son réveil — une seconde mesurée sur
// la page d'accueil. Avec peu de cabinets connectés, cela arrive à presque
// chaque retour sur le site. Un planificateur extérieur (cron-job.org, celui
// qui déclenche déjà les rappels) appelle cette adresse toutes les cinq
// minutes, et le serveur ne s'endort plus.
//
// DEMAIN (serveur au Maroc). Un serveur qui tourne en continu ne s'endort
// pas : le réveil devient inutile. L'adresse sert alors à la SURVEILLANCE —
// c'est elle qu'un outil de supervision interroge pour savoir si MonRDV est
// debout, et elle n'a pas à changer.
//
// Elle ne touche pas à la base et ne dit rien du cabinet : c'est une adresse
// publique, elle ne doit rien apprendre à qui la trouve. Pas de version, pas
// de nom de serveur — seulement « oui », et l'heure.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { ok: true, heure: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
