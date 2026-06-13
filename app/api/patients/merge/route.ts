// Fusionne deux fiches patient en double (du même médecin).
// Réassigne RDV, notes, ordonnances, constantes et documents de la fiche
// "source" vers la fiche "cible", complète les champs manquants de la cible,
// puis supprime la source. Réservé au médecin propriétaire des deux fiches.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { keepId, mergeId } = await req.json()
  if (!keepId || !mergeId || keepId === mergeId) {
    return NextResponse.json({ error: 'Fiches invalides' }, { status: 400 })
  }

  const { data: doctor } = await supabase
    .from('doctors').select('id').eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  // Vérifie que les DEUX fiches appartiennent bien à ce médecin
  const { data: both } = await supabase
    .from('patients').select('*').in('id', [keepId, mergeId]).eq('doctor_id', doctor.id)
  if (!both || both.length !== 2) {
    return NextResponse.json({ error: 'Fiches introuvables' }, { status: 404 })
  }
  const keep = both.find((p) => p.id === keepId)!
  const merge = both.find((p) => p.id === mergeId)!

  const db = createAdminClient()

  // 1. Réassigne tous les enregistrements liés vers la fiche conservée
  for (const table of ['appointments', 'consultation_notes', 'prescriptions', 'vital_signs', 'patient_documents']) {
    const { error } = await db.from(table).update({ patient_id: keepId }).eq('patient_id', mergeId)
    if (error) {
      return NextResponse.json({ error: `Échec de la fusion (${table})` }, { status: 500 })
    }
  }

  // 2. Complète les champs vides de la cible avec ceux de la source (sans écraser)
  const fill: Record<string, unknown> = {}
  for (const f of ['email', 'age', 'allergies', 'chronic_conditions', 'current_treatments', 'notes', 'user_id'] as const) {
    if ((keep[f] == null || keep[f] === '') && merge[f] != null && merge[f] !== '') fill[f] = merge[f]
  }
  if (Object.keys(fill).length > 0) {
    await db.from('patients').update(fill).eq('id', keepId)
  }

  // 3. Supprime la fiche en double (désormais vidée de ses liens)
  const { error: delErr } = await db.from('patients').delete().eq('id', mergeId)
  if (delErr) return NextResponse.json({ error: 'Échec de la suppression du doublon' }, { status: 500 })

  return NextResponse.json({ success: true })
}
