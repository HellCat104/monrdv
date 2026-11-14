// L'espace patient du dentiste — contrôle d'accès serveur, un seul endroit.
//
// Toutes les routes /api/dentaire/* passent par ici. Trois portes :
//   1. une session (sinon 401) ;
//   2. un compte MÉDECIN (une secrétaire n'a pas de ligne `doctors` : elle
//      reçoit 404, et n'accède à aucune donnée clinique par ces routes) ;
//   3. le forfait qui porte le dossier médical, et la spécialité dentaire.
// Puis, pour chaque patient demandé, la vérification qu'il appartient à ce
// médecin — EN PLUS de la RLS : une route qui l'oublierait ne doit pas
// pouvoir montrer le patient d'un autre cabinet.
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isDentalDoctor } from '@/lib/dental'
import { specialitesDu } from '@/types'

export interface ContexteDentaire {
  supabase: SupabaseClient
  doctor: { id: string; plan: string | null }
  userId: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function estUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

export async function requireDentiste(): Promise<{ error: NextResponse } | { ctx: ContexteDentaire }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan, specialty, specialties').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }

  if (!canAccess(doctor.plan, 'records')) {
    return { error: NextResponse.json({ error: 'Votre forfait ne donne pas accès au dossier médical' }, { status: 403 }) }
  }
  if (!isDentalDoctor(specialitesDu(doctor))) {
    return { error: NextResponse.json({ error: 'Réservé aux cabinets dentaires' }, { status: 403 }) }
  }
  return { ctx: { supabase, doctor: { id: doctor.id, plan: doctor.plan }, userId: user.id } }
}

/** Le patient appartient-il à ce cabinet ? Réponse 404 sinon — la même que
 *  pour un patient inexistant, pour ne rien révéler. */
export async function patientDuCabinet(ctx: ContexteDentaire, patientId: unknown): Promise<string | null> {
  if (!estUuid(patientId)) return null
  const { data } = await ctx.supabase
    .from('patients').select('id').eq('id', patientId).eq('doctor_id', ctx.doctor.id).maybeSingle()
  return data?.id ?? null
}

export const PATIENT_INTROUVABLE = () => NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })
