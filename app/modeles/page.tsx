// Les modèles du praticien : ordonnances types et, en gastro-entérologie,
// protocoles de préparation.
//
// Ces tables arrivent VIDES, et c'est délibéré. MonRDV ne livre ni posologie
// ni protocole : les produits, les doses, les volumes et les horaires relèvent
// du praticien, et en proposer reviendrait à prescrire à sa place. L'écran lui
// sert à écrire les siens une fois pour toutes.
//
// L'écran était rangé sous /gastro. La table `prescription_templates` est
// pourtant commune, et un dentiste qui rédige « après extraction » trois fois
// par jour a exactement le même besoin : il vit donc à une adresse commune, et
// chaque branche n'y voit que ce qui la concerne.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor, specialitesDu } from '@/types'
import { aDesModeles, categoriesModeles } from '@/lib/ordonnance'
import ModelesClient from './ModelesClient'

export const dynamic = 'force-dynamic'

export default async function PageModeles() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan, specialty, specialties').eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')

  const specialites = specialitesDu(doctor)
  if (!aDesModeles(specialites)) redirect('/appointments')

  return (
    <ModelesClient
      doctorId={doctor.id}
      categories={categoriesModeles(specialites)}
      // Les protocoles de préparation sont un objet de gastro-entérologie
      // (coloscopie). Les montrer au dentiste lui donnerait un onglet qui ne
      // se remplira jamais.
      preparations={isGastroDoctor(specialites)}
    />
  )
}
