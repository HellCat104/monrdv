// Catalogue d'actes du cabinet — GET /api/quotes/actes
//
// Pas de table de tarifs à tenir à jour : le catalogue, c'est ce que le
// praticien a DÉJÀ facturé. Chaque ligne de devis enrichit la liste, et le
// prix proposé est celui de la dernière fois — un tarif qui change suit donc
// le cabinet sans qu'on ait à le saisir deux fois.
//
// Médecin uniquement, comme le reste de /api/quotes : un tarif se décide.
import { NextResponse } from 'next/server'
import { requireQuoteDoctor } from '@/lib/devis-server'

export const dynamic = 'force-dynamic'

// Au-delà, on n'aide plus : une liste déroulante de 200 actes se parcourt
// moins vite qu'on ne retape le mot.
const MAX_ACTES = 40
// Profondeur de lecture : assez pour couvrir l'habitude du cabinet, assez peu
// pour que la requête reste immédiate.
const MAX_LIGNES = 600

export async function GET() {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data, error } = await supabase
    .from('quote_items')
    .select('label, unit_price, created_at')
    .eq('doctor_id', doctor.id)
    .order('created_at', { ascending: false })
    .limit(MAX_LIGNES)

  if (error) {
    console.error('[Devis] catalogue d\'actes illisible :', error.message)
    // Un catalogue vide n'empêche pas de saisir : on ne casse pas l'écran.
    return NextResponse.json({ actes: [] })
  }

  // Regroupement sur le libellé insensible à la casse et aux espaces :
  // « Couronne  céramique » et « couronne céramique » sont le même acte.
  const parCle = new Map<string, { label: string; unit_price: number; n: number }>()
  for (const ligne of data ?? []) {
    const label = String(ligne.label ?? '').trim()
    if (!label) continue
    const cle = label.toLowerCase().replace(/\s+/g, ' ')
    const vu = parCle.get(cle)
    if (vu) {
      vu.n += 1
    } else {
      // Les lignes arrivent de la plus récente à la plus ancienne : la
      // première vue porte le prix et l'orthographe à proposer.
      parCle.set(cle, { label, unit_price: Number(ligne.unit_price ?? 0), n: 1 })
    }
  }

  const actes = Array.from(parCle.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_ACTES)

  return NextResponse.json({ actes })
}
