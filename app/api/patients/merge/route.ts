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

  const db = createAdminClient()

  // 1. Réassigne tous les enregistrements liés vers la fiche conservée.
  // TOUTE table liée au patient en CASCADE doit figurer ici : ce qui manque à
  // cette liste est détruit silencieusement à l'étape 3, sans erreur ni trace.
  // `session_packages` (forfaits de séances payés d'avance) et `dental_charts`
  // manquaient — soit de l'argent encaissé et l'odontogramme, perdus à chaque
  // fusion. Vérifier cette liste à chaque nouvelle table portant patient_id.
  for (const table of ['appointments', 'consultation_notes', 'prescriptions', 'vital_signs',
    'patient_documents', 'certificates', 'recalls', 'session_packages']) {
    const { error } = await db.from(table).update({ patient_id: keepId }).eq('patient_id', mergeId)
    if (error) {
      return NextResponse.json({ error: `Échec de la fusion (${table})` }, { status: 500 })
    }
  }

  // `dental_charts` a patient_id pour clé primaire : une simple réassignation
  // échouerait si les deux fiches ont un schéma. On conserve celui de la cible,
  // et on ne récupère celui du doublon que si la cible n'en a pas.
  const { data: chartKeep } = await db.from('dental_charts')
    .select('patient_id').eq('patient_id', keepId).maybeSingle()
  if (!chartKeep) {
    const { error: chartErr } = await db.from('dental_charts')
      .update({ patient_id: keepId }).eq('patient_id', mergeId)
    if (chartErr) {
      return NextResponse.json({ error: 'Échec de la fusion (schéma dentaire)' }, { status: 500 })
    }
  }

  // 2. Complète les champs vides de la cible avec ceux de la source (sans écraser)
  const fill: Record<string, unknown> = {}
  // `user_id` est transféré uniquement si la fiche conservée n'en a pas : c'est le
  // cas légitime (même patient inscrit deux fois) — les cas ambigus ont été
  // refusés plus haut.
  for (const f of ['email', 'age', 'allergies', 'chronic_conditions', 'current_treatments', 'notes', 'user_id',
    'birth_date', 'sex', 'cin', 'mutuelle', 'address', 'blood_group', 'surgeries', 'vaccinations',
    'gestational_age_weeks', 'parent1_name', 'parent1_phone', 'parent2_name', 'parent2_phone',
    'primary_contact', 'family_id', 'is_child'] as const) {
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
