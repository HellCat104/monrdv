// Feuilles de soins — contrôle d'accès serveur.
//
// Séparé de lib/feuilles-soins.ts comme lib/devis-server.ts l'est de
// lib/devis.ts : la carte du dossier patient est un composant CLIENT et importe
// les règles pures (statuts, total, normalisation). Si elles vivaient dans le
// même fichier que createClient(), le navigateur embarquerait le client
// serveur — et le build échoue, ce qui est la bonne nouvelle de l'histoire.
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'

/** Le dossier médical : même forfait que les devis et le schéma dentaire. */
export const FEUILLE_FONCTION = 'records' as const

interface Contexte {
  supabase: SupabaseClient
  doctor: { id: string; plan: string | null }
}

/** Médecin connecté, forfait Cabinet complet. La secrétaire n'établit pas de
 *  feuille de soins : elle engage la signature du praticien. */
export async function requireFeuilleDoctor(): Promise<{ error: NextResponse } | { ctx: Contexte }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }

  if (!canAccess(doctor.plan, FEUILLE_FONCTION)) {
    return { error: NextResponse.json({ error: 'Les feuilles de soins nécessitent le forfait Cabinet complet' }, { status: 403 }) }
  }
  return { ctx: { supabase, doctor } }
}

/** 42P01 = table absente : la v65 n'est pas encore passée. */
export const TABLE_ABSENTE = '42P01'
export const FEUILLE_NON_ACTIVEE =
  "Les feuilles de soins ne sont pas encore activées sur votre base (migration v65)."
