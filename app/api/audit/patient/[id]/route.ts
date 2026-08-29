// Historique des accès au dossier d'un patient.
//
// Lecture réservée au médecin propriétaire : la table audit_logs est en RLS
// sans policy, donc inaccessible depuis le navigateur. Elle ne se lit qu'ici,
// après vérification que le patient appartient bien au cabinet appelant.
//
// La secrétaire n'y a pas accès : un journal que la personne consignée peut
// consulter — et dont elle peut déduire ce qui est surveillé — perd une partie
// de son effet dissuasif.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  if (!canAccess(doctor.plan, 'records')) {
    return NextResponse.json({ error: 'Votre forfait ne donne pas accès au dossier médical' }, { status: 403 })
  }

  // Le patient doit appartenir au cabinet : sans ce contrôle, l'historique
  // révélerait l'existence de dossiers d'autres médecins.
  const { data: patient } = await supabase
    .from('patients').select('id').eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('audit_logs')
    .select('id, action, metadata, created_at')
    .eq('doctor_id', doctor.id)
    .eq('target_type', 'patient')
    .eq('target_id', params.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json({ acces: data ?? [] })
}
