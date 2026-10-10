// Une feuille de soins — lecture, suivi (remise / remboursée), suppression.
import { NextRequest, NextResponse } from 'next/server'
import { STATUTS_FEUILLE, type StatutFeuille } from '@/lib/feuilles-soins'
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await laFeuille(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, feuille } = r.ctx

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  if ('status' in body) {
    const statut = String(body.status) as StatutFeuille
    if (!STATUTS_FEUILLE.includes(statut)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    patch.status = statut
  }
  if ('notes' in body) patch.notes = body.notes ? String(body.notes).slice(0, 500) : null

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })

  const { data, error } = await supabase
    .from('care_sheets').update(patch).eq('id', feuille.id).eq('doctor_id', doctor.id)
    .select('*, items:care_sheet_items(*)').single()
  if (error || !data) return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await laFeuille(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, feuille } = r.ctx

  const { error } = await supabase.from('care_sheets').delete().eq('id', feuille.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
