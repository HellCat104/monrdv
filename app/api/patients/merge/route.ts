// Fusionne deux fiches patient en double (du même médecin).
// Réassigne RDV, notes, ordonnances, constantes et documents de la fiche
// "source" vers la fiche "cible", complète les champs manquants de la cible,
// puis supprime la source. Réservé au médecin propriétaire des deux fiches.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // ── Garde-fous : refuser la fusion de deux personnes DIFFÉRENTES ──
  // La fusion est irréversible et mélange dossiers médicaux ET accès patient.
  // Deux comptes patients distincts = deux personnes, jamais un doublon.
  if (keep.user_id && merge.user_id && keep.user_id !== merge.user_id) {
    return NextResponse.json({
      error: 'Ces deux fiches sont rattachées à deux comptes patients différents : il ne s\'agit pas d\'un doublon. Fusion refusée.',
    }, { status: 409 })
  }
  // Deux dates de naissance renseignées et différentes = deux personnes
  // (cas fréquent en pédiatrie : frères et sœurs de même nom).
  if (keep.birth_date && merge.birth_date && keep.birth_date !== merge.birth_date) {
    return NextResponse.json({
      error: 'Ces deux fiches ont des dates de naissance différentes : il ne s\'agit pas d\'un doublon. Fusion refusée.',
    }, { status: 409 })
  }

  // La fonction PostgreSQL est transactionnelle : aucune table ne peut rester
  // réassignée si une étape suivante échoue.
  const { error: mergeError } = await supabase.rpc('merge_patients_atomic', {
    p_doctor_id: doctor.id, p_keep_id: keepId, p_merge_id: mergeId, p_actor: user.id,
  })
  if (mergeError) return NextResponse.json({ error: 'Échec de la fusion : ' + mergeError.message }, { status: 409 })

  return NextResponse.json({ success: true })
}
