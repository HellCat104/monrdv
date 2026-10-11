// Un traitement orthodontique — mise à jour et clôture.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor } from '@/lib/labo-server'
import { nettoyerTraitement } from '@/lib/ortho'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data: traitement } = await supabase
    .from('ortho_treatments').select('id, status, ended_on')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!traitement) return NextResponse.json({ error: 'Traitement introuvable' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const updates = nettoyerTraitement(body)
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  // Un traitement qu'on termine porte sa date de fin : sans elle, l'avancement
  // continuerait de courir et afficherait « mois 31 sur 18 ».
  if ((updates.status === 'termine' || updates.status === 'interrompu') && !traitement.ended_on && !('ended_on' in body)) {
    updates.ended_on = new Date().toISOString().slice(0, 10)
  }
  if (updates.status === 'en_cours' && !('ended_on' in body)) updates.ended_on = null
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('ortho_treatments').update(updates).eq('id', traitement.id).eq('doctor_id', doctor.id)
    .select('*, visits:ortho_visits(id, visit_date, act, wire, next_visit, notes)').single()

  if (error || !data) {
    console.error('[Ortho] modification impossible :', error?.message)
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { error } = await supabase
    .from('ortho_treatments').delete().eq('id', params.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
