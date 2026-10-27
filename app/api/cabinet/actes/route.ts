// Le CATALOGUE D'ACTES du cabinet — lecture seule.
//
// `consultation_types` sert deux usages depuis la v86 : les motifs de
// rendez-vous et les actes facturables. Cette route ne renvoie que les
// seconds, pour que l'odontogramme et le devis ne proposent pas « Contrôle
// gratuit » comme ligne à facturer.
//
// Le forfait est contrôlé ici, pas seulement à l'écran : masquer un bouton
// n'empêche pas d'appeler l'adresse.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
  if (!canAccess(doctor.plan, 'records')) {
    return NextResponse.json({ error: 'Forfait insuffisant' }, { status: 403 })
  }

  // `acte` et `categorie` n'existent qu'à partir de la v86. Tant qu'elle n'est
  // pas passée, on renvoie le catalogue sans eux plutôt que de tomber en
  // erreur : règle de la maison — pas de migration, pas de fonctionnalité,
  // mais jamais d'écran cassé.
  const complet = await supabase
    .from('consultation_types')
    .select('id, name, default_price, categorie, code, labo')
    .eq('doctor_id', doctor.id).eq('active', true).eq('acte', true)
    .order('categorie', { ascending: true }).order('name', { ascending: true })

  if (!complet.error) return NextResponse.json({ actes: complet.data ?? [] })

  const simple = await supabase
    .from('consultation_types')
    .select('id, name, default_price')
    .eq('doctor_id', doctor.id).eq('active', true)
    .order('name', { ascending: true })

  if (simple.error) {
    // Un catalogue illisible n'empêche pas de saisir un prix à la main.
    console.error('[Catalogue] illisible :', simple.error.message)
    return NextResponse.json({ actes: [] })
  }
  return NextResponse.json({
    actes: (simple.data ?? []).map((a) => ({ ...a, categorie: null, code: null, labo: false })),
  })
}
