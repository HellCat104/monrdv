// Travaux de laboratoire — contrôle d'accès serveur (cf. lib/devis-server.ts :
// les règles pures vivent dans lib/labo.ts, importé côté navigateur).
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'

/** Le dossier médical : même forfait que les devis et le schéma dentaire. */
export const LABO_FONCTION = 'records' as const

/** 42P01 = table absente (migration v68 non passée). */
export const TABLE_ABSENTE = '42P01'
export const LABO_NON_ACTIVE =
  "Le suivi des travaux de laboratoire n'est pas encore activé sur votre base (migration v68)."

interface Contexte {
  supabase: SupabaseClient
  doctor: { id: string; plan: string | null }
}

export async function requireLaboDoctor(): Promise<{ error: NextResponse } | { ctx: Contexte }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }

  if (!canAccess(doctor.plan, LABO_FONCTION)) {
    return { error: NextResponse.json({ error: 'Le laboratoire nécessite le forfait Cabinet complet' }, { status: 403 }) }
  }
  return { ctx: { supabase, doctor } }
}
