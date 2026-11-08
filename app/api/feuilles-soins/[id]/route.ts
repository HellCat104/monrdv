// Une feuille de soins — lecture et suppression.
//
// Elle ne se MODIFIE pas. Il y avait ici de quoi la faire passer d'« établie »
// à « remise » puis « remboursée », avec les dates et le montant versé : le
// suivi du remboursement. C'est retiré — au Maroc le patient règle la
// consultation, repart avec sa feuille remplie et la dépose lui-même ; le
// cabinet n'en entend plus jamais parler, et n'avait donc rien de vrai à
// inscrire dans ces cases.
import { NextRequest, NextResponse } from 'next/server'
import { requireFeuilleDoctor } from '@/lib/feuilles-soins-server'

export const dynamic = 'force-dynamic'

async function laFeuille(id: string) {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return { error: auth.error }
  const { supabase, doctor } = auth.ctx

  const { data } = await supabase
    .from('care_sheets').select('*, items:care_sheet_items(*)')
    .eq('id', id).eq('doctor_id', doctor.id).maybeSingle()
  if (!data) return { error: NextResponse.json({ error: 'Feuille introuvable' }, { status: 404 }) }

  return { ctx: { supabase, doctor, feuille: data } }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await laFeuille(params.id)
  if ('error' in r) return r.error
  return NextResponse.json(r.ctx.feuille)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await laFeuille(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, feuille } = r.ctx

  const { error } = await supabase.from('care_sheets').delete().eq('id', feuille.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
