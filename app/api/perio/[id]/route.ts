// Un relevé parodontal — lecture et suppression.
//
// Pas de modification : un relevé est un CONSTAT daté. Le corriger après coup
// effacerait le point de comparaison qui fait toute sa valeur. Une erreur de
// saisie se supprime et se refait — le geste est alors visible.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor } from '@/lib/labo-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data } = await supabase
    .from('perio_charts').select('*').eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Relevé introuvable' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { error } = await supabase
    .from('perio_charts').delete().eq('id', params.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
