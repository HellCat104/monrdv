// Renommer, recolorer, réordonner ou démonter un poste.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tablePostesAbsente, POSTES_NON_ACTIVES } from '@/lib/postes'

export const dynamic = 'force-dynamic'

const CHAMPS = 'id, nom, ordre, couleur, actif'

async function medecin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const { data: doctor } = await supabase
    .from('doctors').select('id').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }
  return { ctx: { supabase, doctor } }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (body.nom !== undefined) {
    const nom = String(body.nom).trim()
    if (!nom) return NextResponse.json({ error: 'Donnez un nom à ce poste.' }, { status: 400 })
    updates.nom = nom.slice(0, 60)
  }
  if (body.couleur !== undefined) updates.couleur = body.couleur ? String(body.couleur).slice(0, 20) : null
  if (body.ordre !== undefined && Number.isFinite(Number(body.ordre))) updates.ordre = Math.trunc(Number(body.ordre))
  if (body.actif !== undefined) updates.actif = Boolean(body.actif)
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('cabinet_postes').update(updates)
    .eq('id', params.id).eq('doctor_id', doctor.id)
    .select(CHAMPS).maybeSingle()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Un poste porte déjà ce nom.' }, { status: 409 })
    if (tablePostesAbsente(error)) return NextResponse.json({ error: POSTES_NON_ACTIVES }, { status: 503 })
    console.error('[Postes] modification impossible :', error.message)
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Poste introuvable' }, { status: 404 })
  return NextResponse.json({ poste: data })
}

// DELETE — on DÉMONTE, on n'efface pas. Les rendez-vous passés gardent la
// trace du fauteuil où ils ont eu lieu ; effacer le poste les laisserait sans
// lieu, et la journée d'hier deviendrait illisible.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data, error } = await supabase
    .from('cabinet_postes').update({ actif: false })
    .eq('id', params.id).eq('doctor_id', doctor.id)
    .select('id').maybeSingle()

  if (error) {
    if (tablePostesAbsente(error)) return NextResponse.json({ error: POSTES_NON_ACTIVES }, { status: 503 })
    console.error('[Postes] démontage impossible :', error.message)
    return NextResponse.json({ error: 'Opération impossible' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Poste introuvable' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
