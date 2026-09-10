// API : réservation d'une place offerte par la liste d'attente (lien de l'e-mail).
//
// POST uniquement pour réserver — un GET ne doit jamais muter : les scanners
// d'e-mails (antivirus, messageries d'entreprise) préchargent les liens, et un
// GET qui réservait avancerait des rendez-vous que personne n'a demandé à
// avancer. La page /creneau/[token] est en lecture seule ; la réservation part
// d'un clic explicite. Même principe que /annuler/[token] → /api/cancel/[token].
//
// Toute la logique (contrôles, ordre des écritures, arbitrage de la course)
// vit dans lib/waitlist.ts : cette route ne fait que traduire en HTTP.
import { NextRequest, NextResponse } from 'next/server'
import { reserverOffre, desinscrireParOffre, type EtatOffre } from '@/lib/waitlist'

export const dynamic = 'force-dynamic'

// Un refus « métier » (place prise, offre déjà utilisée, créneau passé) n'est
// pas une panne : 409, avec la phrase à afficher. Seul le jeton inconnu est un
// 404, et seule l'erreur de lecture/écriture un 500.
function codePour(etat: EtatOffre): number {
  if (etat === 'inconnue') return 404
  if (etat === 'erreur') return 500
  return 409
}

// POST /api/waitlist/[token] — « Avancer mon rendez-vous »
export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await reserverOffre(params.token)
  if (!r.ok) return NextResponse.json({ error: r.message, etat: r.etat }, { status: codePour(r.etat) })
  return NextResponse.json({ success: true, nouveau: r.nouveau, ancien: r.ancien, ancienAnnule: r.ancienAnnule })
}

// DELETE /api/waitlist/[token] — « Ne plus me proposer de créneaux »
export async function DELETE(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await desinscrireParOffre(params.token)
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 })
  return NextResponse.json({ success: true, message: r.message })
}
