// API devis — liste (par patient) et création.
//
// Accès : MÉDECIN UNIQUEMENT, et ce fichier le reste. Un devis n'est pas une
// somme, c'est un plan de traitement (dent, acte, indication) : le créer, en
// modifier une ligne, un prix ou un statut est une décision du praticien.
// `payments` et `edit_prices`, qui pourraient sembler proches, ont été pensées
// pour le prix d'UNE consultation, pas pour décider quels actes seront posés
// dans la bouche d'un patient.
//
// La secrétaire, elle, passe par /api/cabinet/quotes (v55), qui n'offre que
// deux gestes : LIRE les devis d'un patient (permission `quotes_view`) et
// SAISIR UN VERSEMENT reçu (`quotes_payment`) — l'un et l'autre cochés par le
// médecin dans « Mon équipe ». Elle n'a rien à faire ici : requireQuoteDoctor()
// cherche son e-mail dans `doctors`, ne l'y trouve pas, et répond 404.
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, colonneValiditeAbsente, VALIDITE_NON_ACTIVEE } from '@/lib/devis-server'
import { normaliserValidite } from '@/lib/devis'

export const dynamic = 'force-dynamic'

// GET /api/quotes?patient_id=… — devis d'un patient, avec lignes, versements
// et échéancier (le dossier patient les affiche tous ensemble).
export async function GET(req: NextRequest) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const patientId = req.nextUrl.searchParams.get('patient_id')
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const { data, error } = await supabase
    .from('quotes')
    .select('*, items:quote_items(*), payments:quote_payments(*), installments:quote_installments(*)')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json({ quotes: data ?? [] })
}

// POST /api/quotes — nouveau devis (brouillon), éventuellement avec ses lignes.
export async function POST(req: NextRequest) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const patientId = body.patient_id ? String(body.patient_id) : ''
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  // Le patient doit appartenir au cabinet : sans ce contrôle, un devis pourrait
  // être accroché au dossier d'un patient d'un autre médecin.
  const { data: patient } = await supabase
    .from('patients').select('id').eq('id', patientId).eq('doctor_id', doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  // Validité (v58) : texte libre, vide par défaut — voir lib/devis.ts. Une
  // saisie trop longue est REFUSÉE, pas tronquée : couper la phrase du
  // médecin au 120e caractère imprimerait une mention qu'il n'a pas écrite.
  const validite = normaliserValidite(body.validity_text)
  if (!validite.ok) return NextResponse.json({ error: validite.error }, { status: 400 })

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      doctor_id: doctor.id,
      patient_id: patientId,
      label: body.label ? String(body.label).slice(0, 120) : null,
      notes: body.notes ? String(body.notes).slice(0, 2000) : null,
      // Colonne envoyée seulement si le médecin a écrit quelque chose : sans
      // la migration v58, un devis sans validité doit continuer de se créer.
      ...(validite.value !== null ? { validity_text: validite.value } : {}),
    })
    .select('*')
    .single()

  if (error || !quote) {
    console.error('[Devis] création impossible :', error?.message)
    if (colonneValiditeAbsente(error)) {
      return NextResponse.json({ error: VALIDITE_NON_ACTIVEE }, { status: 503 })
    }
    return NextResponse.json({ error: 'Le devis n\'a pas pu être créé' }, { status: 500 })
  }

  // Écriture relue : la mention imprimée sur le devis doit être celle que le
  // médecin a tapée. Un écart (déclencheur ajouté un jour, colonne modifiée)
  // ne doit pas passer pour un succès.
  if (validite.value !== null && quote.validity_text !== validite.value) {
    console.error('[Devis] validité non enregistrée à la création du devis', quote.id)
    return NextResponse.json({
      error: 'Le devis a été créé, mais sa mention de validité n\'a pas été enregistrée. Ouvrez-le et saisissez-la de nouveau.',
    }, { status: 500 })
  }

  return NextResponse.json({ ...quote, items: [], payments: [], installments: [] }, { status: 201 })
}
