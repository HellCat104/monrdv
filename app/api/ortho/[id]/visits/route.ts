// Séances d'un traitement orthodontique — ajout et suppression.
//
// Une séance est un CONSTAT daté : elle s'ajoute et se supprime, elle ne se
// modifie pas. L'historique des activations est ce qu'on relit avant de poser
// l'arc suivant ; réécrire une séance d'il y a trois mois brouillerait cette
// lecture sans laisser de trace.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor } from '@/lib/labo-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data: traitement } = await supabase
    .from('ortho_treatments').select('id, patient_id')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!traitement) return NextResponse.json({ error: 'Traitement introuvable' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const date = (v: unknown) => {
    const s = String(v ?? '')
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
  }
  const texte = (v: unknown, max: number) => {
    const t = String(v ?? '').trim().slice(0, max)
    return t || null
  }

  let appointmentId: string | null = null
  if (body.appointment_id) {
    const { data: apt } = await supabase
      .from('appointments').select('id')
      .eq('id', String(body.appointment_id)).eq('doctor_id', doctor.id)
      .eq('patient_id', traitement.patient_id).maybeSingle()
    if (apt) appointmentId = apt.id
  }

  const { data, error } = await supabase
    .from('ortho_visits')
    .insert({
      treatment_id: traitement.id,
      doctor_id: doctor.id,
      appointment_id: appointmentId,
      visit_date: date(body.visit_date) ?? new Date().toISOString().slice(0, 10),
      act: texte(body.act, 120),
      wire: texte(body.wire, 120),
      next_visit: date(body.next_visit),
      notes: texte(body.notes, 500),
    })
    .select('id, visit_date, act, wire, next_visit, notes')
    .single()

  if (error || !data) {
    console.error('[Ortho] séance non enregistrée :', error?.message)
    return NextResponse.json({ error: "La séance n'a pas pu être enregistrée" }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const visiteId = req.nextUrl.searchParams.get('visit_id')
  if (!visiteId) return NextResponse.json({ error: 'Séance manquante' }, { status: 400 })

  const { error } = await supabase
    .from('ortho_visits').delete()
    .eq('id', visiteId).eq('treatment_id', params.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
