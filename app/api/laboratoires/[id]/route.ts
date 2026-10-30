// Modifier la fiche d'un laboratoire, ou le retirer de l'annuaire.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { tableLaboAbsente, LABO_NON_ACTIVE } from '@/lib/laboratoires'

export const dynamic = 'force-dynamic'

const CHAMPS = 'id, nom, telephone, contact, email, adresse, delai_jours, notes, actif'

async function medecin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }
  if (!canAccess(doctor.plan, 'records')) {
    return { error: NextResponse.json({ error: 'Forfait insuffisant' }, { status: 403 }) }
  }
  return { ctx: { supabase, doctor } }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  const texte = (v: unknown, n: number) => (v ? String(v).slice(0, n) : null)

  if (body.nom !== undefined) {
    const nom = String(body.nom).trim()
    if (!nom) return NextResponse.json({ error: 'Donnez un nom au laboratoire.' }, { status: 400 })
    updates.nom = nom.slice(0, 120)
  }
  if (body.telephone !== undefined) updates.telephone = texte(body.telephone, 30)
  if (body.contact   !== undefined) updates.contact   = texte(body.contact, 120)
  if (body.email     !== undefined) updates.email     = texte(body.email, 254)
  if (body.adresse   !== undefined) updates.adresse   = texte(body.adresse, 200)
  if (body.notes     !== undefined) updates.notes     = texte(body.notes, 500)
  if (body.actif     !== undefined) updates.actif     = Boolean(body.actif)
  if (body.delai_jours !== undefined) {
    const d = body.delai_jours === '' || body.delai_jours === null ? null : Number(body.delai_jours)
    if (d != null && (!Number.isFinite(d) || d < 0 || d > 365)) {
      return NextResponse.json({ error: 'Délai invalide (0 à 365 jours).' }, { status: 400 })
    }
    updates.delai_jours = d == null ? null : Math.trunc(d)
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('cabinet_laboratoires').update(updates)
    .eq('id', params.id).eq('doctor_id', doctor.id)
    .select(CHAMPS).maybeSingle()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Un laboratoire porte déjà ce nom.' }, { status: 409 })
    if (tableLaboAbsente(error)) {
      return NextResponse.json({ error: LABO_NON_ACTIVE }, { status: 503 })
    }
    console.error('[Laboratoires] modification impossible :', error.message)
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Laboratoire introuvable' }, { status: 404 })
  return NextResponse.json({ laboratoire: data })
}

// DELETE — on RETIRE de l'annuaire, on n'efface pas. Les travaux déjà confiés
// à ce prothésiste gardent leur lien et le nom sous lequel ils sont partis :
// effacer la fiche rendrait illisibles les bons de l'an dernier.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data, error } = await supabase
    .from('cabinet_laboratoires').update({ actif: false })
    .eq('id', params.id).eq('doctor_id', doctor.id)
    .select('id').maybeSingle()

  if (error) {
    if (tableLaboAbsente(error)) {
      return NextResponse.json({ error: LABO_NON_ACTIVE }, { status: 503 })
    }
    console.error('[Laboratoires] retrait impossible :', error.message)
    return NextResponse.json({ error: 'Opération impossible' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Laboratoire introuvable' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
