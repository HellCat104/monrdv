// Les modèles du praticien : ordonnances types et protocoles de préparation.
//
// Ces deux tables arrivent VIDES, et c'est délibéré. MonRDV ne livre ni
// posologie ni protocole de préparation : les produits, les doses, les volumes
// et les horaires relèvent du médecin, et en proposer reviendrait à prescrire
// à sa place. L'écran lui sert à écrire les siens une fois pour toutes.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor } from '@/types'
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

  const specialites = (doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : [])
  if (!isGastroDoctor(specialites)) redirect('/appointments')

  return <ModelesClient doctorId={doctor.id} />
}
