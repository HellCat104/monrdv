// Suivis de surveillance et résultats en attente — BRANCHE GASTRO.
//
// Un seul écran pour les deux, et c'est délibéré : ce sont les deux listes de
// « ce que j'ai promis de faire et que personne ne me rappellera ». Un patient
// surveillé tous les trois ans et une anapath qui n'est jamais revenue se
// perdent de la même façon — parce qu'ils ne sont inscrits nulle part où l'on
// regarde.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGastroDoctor } from '@/types'
import SuivisClient from './SuivisClient'

export const dynamic = 'force-dynamic'

export default async function PageSuivis() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan, specialty, specialties').eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')

  const specialites = (doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : [])
  if (!isGastroDoctor(specialites)) redirect('/appointments')

  return <SuivisClient />
}
