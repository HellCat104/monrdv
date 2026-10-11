// Un travail de laboratoire — modification (statut, dates, coût) et suppression.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor } from '@/lib/labo-server'
import { nettoyerTravail } from '../route'

export const dynamic = 'force-dynamic'

async function leTravail(id: string) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return { error: auth.error }
  const { supabase, doctor } = auth.ctx

  const { data } = await supabase
    .from('lab_works').select('*').eq('id', id).eq('doctor_id', doctor.id).maybeSingle()
  if (!data) return { error: NextResponse.json({ error: 'Travail introuvable' }, { status: 404 }) }
  return { ctx: { supabase, doctor, travail: data } }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await leTravail(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, travail } = r.ctx

  const body = await req.json().catch(() => ({}))
  const updates = nettoyerTravail(body)

  // Les dates suivent le statut quand le praticien ne les a pas saisies : il
  // clique « envoyé » un lundi, c'est que c'est parti ce lundi-là.
  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (updates.status === 'envoye' && !travail.sent_at && !('sent_at' in body)) updates.sent_at = aujourdhui
  if (updates.status === 'recu' && !travail.received_at && !('received_at' in body)) updates.received_at = aujourdhui

  if ('appointment_id' in body) {
    if (!body.appointment_id) updates.appointment_id = null
    else {
      const { data: apt } = await supabase
        .from('appointments').select('id')
        .eq('id', String(body.appointment_id)).eq('doctor_id', doctor.id).eq('patient_id', travail.patient_id).maybeSingle()
      if (!apt) return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 })
      updates.appointment_id = apt.id
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('lab_works').update(updates).eq('id', travail.id).eq('doctor_id', doctor.id)
    .select('*').single()
  if (error || !data) {
    console.error('[Laboratoire] modification impossible :', error?.message)
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await leTravail(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, travail } = r.ctx

  // Un travail déjà passé en comptabilité ne s'efface pas en silence : la
  // dépense, elle, resterait. Le praticien annule d'abord la ligne comptable.
  if (travail.cost_expense_id) {
    return NextResponse.json({
      error: 'Ce travail a été ajouté à la comptabilité. Supprimez d\'abord la dépense correspondante.',
    }, { status: 409 })
  }

  const { error } = await supabase.from('lab_works').delete().eq('id', travail.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
