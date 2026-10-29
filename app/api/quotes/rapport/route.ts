// Le rapport des plans de traitement — médecin uniquement.
//
// Les devis d'un cabinet nomment des actes, des dents et des montants : ils
// relèvent du dossier de soins, comme partout ailleurs dans /api/quotes. Le
// contrôle de forfait est celui de requireQuoteDoctor (`records`).
//
// Le CALCUL vit dans lib/rapport-devis.ts, partagé avec l'écran : un total
// recalculé à deux endroits finit par donner deux nombres différents.
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor } from '@/lib/devis-server'
import { rapportDevis, type DevisRapport } from '@/lib/rapport-devis'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const jour = (v: string | null, defaut: string) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : defaut
  const debut = jour(req.nextUrl.searchParams.get('debut'), '0000-01-01')
  const fin = jour(req.nextUrl.searchParams.get('fin'), '9999-12-31')

  // Le jour au Maroc, lu composante par composante : une date de calendrier
  // passée par toISOString() recule d'un jour dès que le serveur est en
  // avance sur le Maroc, et « proposé il y a 21 jours » basculerait un jour
  // trop tôt.
  const n = new Date()
  const aujourdhui = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`

  // Tout le cabinet : l'encours et les relances ne se limitent pas à la
  // période affichée — un plan signé l'an dernier et jamais posé est toujours
  // à faire, et un devis oublié en mars se rappelle encore en juin.
  const { data, error } = await supabase
    .from('quotes')
    .select('id, status, label, proposed_at, accepted_at, created_at, patient:patients(first_name, last_name), items:quote_items(unit_price, quantity, done, done_at, label)')
    .eq('doctor_id', doctor.id)
    .neq('status', 'annule')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    console.error('[Devis] rapport illisible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }

  const devis = (data ?? []) as unknown as DevisRapport[]
  return NextResponse.json({
    rapport: rapportDevis(devis, debut, fin, aujourdhui),
    // Y a-t-il seulement de quoi afficher le bloc ? Un cabinet qui n'a jamais
    // fait de devis ne doit pas porter un rapport vide.
    aDesDevis: devis.length > 0,
  })
}
