// Catalogue des actes de feuille de soins — GET /api/feuilles-soins/actes
//
// Même principe que le catalogue des devis : le logiciel n'invente aucun code
// de nomenclature. Il rend au praticien ce qu'il a déjà écrit — libellé, code
// et dernier montant — pour qu'il ne le retape pas à chaque feuille.
import { NextResponse } from 'next/server'
import { requireFeuilleDoctor, TABLE_ABSENTE } from '@/lib/feuilles-soins-server'

export const dynamic = 'force-dynamic'

const MAX_ACTES = 40
const MAX_LIGNES = 600

export async function GET() {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data, error } = await supabase
    .from('care_sheet_items')
    .select('label, code, amount, created_at')
    .eq('doctor_id', doctor.id)
    .order('created_at', { ascending: false })
    .limit(MAX_LIGNES)

  if (error) {
    if (error.code !== TABLE_ABSENTE) console.error('[Feuille de soins] catalogue illisible :', error.message)
    return NextResponse.json({ actes: [] })
  }

  const parCle = new Map<string, { label: string; code: string | null; amount: number; n: number }>()
  for (const ligne of data ?? []) {
    const label = String(ligne.label ?? '').trim()
    if (!label) continue
    const cle = label.toLowerCase().replace(/\s+/g, ' ')
    const vu = parCle.get(cle)
    if (vu) vu.n += 1
    // Les lignes arrivent de la plus récente à la plus ancienne : la première
    // vue porte le code et le tarif à proposer.
    else parCle.set(cle, { label, code: ligne.code ?? null, amount: Number(ligne.amount ?? 0), n: 1 })
  }

  return NextResponse.json({
    actes: Array.from(parCle.values()).sort((a, b) => b.n - a.n).slice(0, MAX_ACTES),
  })
}
