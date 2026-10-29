// Le SUIVI DES REMBOURSEMENTS — toutes les feuilles de soins du cabinet.
//
// Elles ne vivaient que dans le dossier de chaque patient. Retrouver celle
// déposée il y a trois mois et jamais remboursée imposait d'ouvrir les
// dossiers un par un : personne ne le faisait, et les dossiers s'enlisaient
// sans que rien ne le signale.
//
// L'argent va de l'organisme AU PATIENT, qui a déjà réglé le cabinet. Cet
// écran n'est donc pas une liste de créances et n'entre dans aucun total
// comptable : il sert à répondre au patient qui rappelle, et à voir ce qui
// traîne.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import RemboursementsClient from './RemboursementsClient'

export const dynamic = 'force-dynamic'

export default async function PageRemboursements() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) notFound()
  // Une feuille de soins décrit des actes : elle appartient au dossier de
  // soins, comme le devis. Le forfait est contrôlé ici ET dans la route —
  // masquer une entrée de menu n'empêche pas d'appeler l'adresse.
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')

  return <RemboursementsClient />
}
