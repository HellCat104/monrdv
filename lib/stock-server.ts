// Contrôle d'accès des routes /api/stock — un seul endroit, appliqué partout.
//
// Le stock n'est pas une donnée de santé : il n'appartient à aucun patient. Il
// dit en revanche ce que le cabinet achète, à qui et à quel prix, et cela
// n'a pas à sortir du cabinet. Toutes les routes passent donc par ici, et le
// `.eq('doctor_id', …)` est répété en plus de la RLS : une route qui l'oublie
// laisserait deviner un identifiant pour lire les fournisseurs d'un confrère.
//
// Forfait : `stock` (voir lib/plan.ts). Le forfait Agenda s'arrête à la prise
// de rendez-vous, et on ne masque pas un bouton en laissant l'adresse ouverte.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'

export interface StockContext {
  supabase: ReturnType<typeof createClient>
  doctor: { id: string; plan: string | null }
}

export async function requireStockDoctor(): Promise<{ error: NextResponse } | { ctx: StockContext }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }

  if (!canAccess(doctor.plan, 'stock')) {
    return {
      error: NextResponse.json(
        { error: 'Le stock nécessite le forfait Cabinet complet' }, { status: 403 }),
    }
  }
  return { ctx: { supabase, doctor } }
}

/** La v88 n'est pas passée. Règle de la maison : pas de migration, pas de
 *  fonctionnalité — mais jamais d'écran cassé. Les écrans lisent ce drapeau
 *  et se présentent eux-mêmes comme en attente. */
export function tableStockAbsente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  return code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST202'
    || msg.includes('stock_articles') || msg.includes('stock_mouvement')
}

export const STOCK_NON_ACTIVE = 'Le stock attend une migration de la base (v88).'
