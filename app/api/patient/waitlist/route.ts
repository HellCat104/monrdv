// API : inscription / désinscription en liste d'attente depuis l'espace patient.
//
// Le patient ne touche jamais `waitlist_entries` depuis son navigateur (aucune
// policy patient, migration v56). Cette route établit d'abord la PROPRIÉTÉ —
// le rendez-vous appartient à une fiche rattachée à ce compte, exactement
// comme l'annulation depuis l'espace (app/api/patient/appointments/[id]/cancel)
// — puis délègue à lib/waitlist.ts, qui vérifie tout le reste.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { inscrireEnListeAttente, desinscrireDeListeAttente } from '@/lib/waitlist'

// POST { appointment_id, inscrire: boolean }
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const appointmentId = String(body.appointment_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId) || typeof body.inscrire !== 'boolean') {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const adminDb = createAdminClient()
  const { data: fiches, error: errFiches } = await adminDb
    .from('patients').select('id').eq('user_id', user.id)
  if (errFiches) return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  const patientIds = (fiches ?? []).map((p: { id: string }) => p.id)
  if (patientIds.length === 0) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const { data: rdv, error: errRdv } = await adminDb
    .from('appointments').select('id')
    .eq('id', appointmentId).in('patient_id', patientIds).maybeSingle()
  if (errRdv) return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  if (!rdv) return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })

  if (body.inscrire) {
    const r = await inscrireEnListeAttente(rdv.id)
    // Un refus (cabinet sans liste d'attente, rendez-vous passé, pas d'e-mail)
    // est renvoyé avec sa phrase : l'interrupteur ne doit pas rester sur
    // « activé » alors que personne ne préviendra le patient.
    if (!r.ok) return NextResponse.json({ error: r.raison }, { status: 409 })
    return NextResponse.json({ inscrit: true })
  }

  const ok = await desinscrireDeListeAttente(rdv.id)
  if (!ok) return NextResponse.json({ error: 'La désinscription n\'a pas pu être enregistrée. Réessayez.' }, { status: 500 })
  return NextResponse.json({ inscrit: false })
}
