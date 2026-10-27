// Le STOCK du cabinet.
//
// C'était le seul poste du cabinet dentaire dont MonRDV ne savait rien :
// combien reste-t-il de composite A2, de cartouches d'anesthésique, de gants
// en M ? On s'en apercevait au fauteuil, patient installé.
//
// L'écran arrive VIDE, et c'est délibéré : aucun catalogue n'est livré, aucun
// fournisseur, aucun tarif. Les références d'un cabinet de Rabat ne sont pas
// celles d'un cabinet de Taroudant, et une liste pré-remplie qu'il faut
// corriger ligne à ligne coûte plus de temps qu'elle n'en fait gagner.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { specialitesDu } from '@/types'
import { isDentalDoctor } from '@/lib/dental'
import { categoriesStock } from '@/lib/stock'
import StockClient from './StockClient'

export const dynamic = 'force-dynamic'

export default async function PageStock() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan, specialty, specialties').eq('email', user.email).single()
  if (!doctor) notFound()
  // Le forfait est contrôlé ici ET dans chaque route : masquer une entrée de
  // menu n'empêche pas d'appeler l'adresse.
  if (!canAccess(doctor.plan, 'stock')) redirect('/appointments')

  const dentaire = isDentalDoctor(specialitesDu(doctor))

  return <StockClient categories={categoriesStock(dentaire)} />
}
