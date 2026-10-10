// Feuilles de soins — liste par patient (GET) et établissement (POST).
//
// Médecin uniquement : établir une feuille de soins, c'est attester des actes
// sous sa signature. La secrétaire peut en revanche la retrouver dans le
// dossier (lecture) une fois qu'elle existe — ce n'est pas cette route.
import { NextRequest, NextResponse } from 'next/server'
import { normaliserLigne, totalFeuille, type LigneFeuille } from '@/lib/feuilles-soins'
import { requireFeuilleDoctor, TABLE_ABSENTE, FEUILLE_NON_ACTIVEE } from '@/lib/feuilles-soins-server'

export const dynamic = 'force-dynamic'

const MAX_LIGNES = 30

export async function GET(req: NextRequest) {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const patientId = req.nextUrl.searchParams.get('patient_id')
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const { data, error } = await supabase
    .from('care_sheets')
    .select('*, items:care_sheet_items(*)')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .order('care_date', { ascending: false })

  if (error) {
    // Sans la migration, le dossier s'affiche sans la carte plutôt que de tomber.
    if (error.code === TABLE_ABSENTE) return NextResponse.json({ feuilles: [], activee: false })
    console.error('[Feuille de soins] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ feuilles: data ?? [], activee: true })
}

export async function POST(req: NextRequest) {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const patientId = body.patient_id ? String(body.patient_id) : ''
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  // Le patient appartient-il au cabinet ? On en profite pour lire l'assuré :
  // la feuille le RECOPIE (migration v65), elle ne le pointe pas.
  const { data: patient } = await supabase
    .from('patients')
    .select('id, mutuelle, insured_name, insured_number, insured_relation, first_name, last_name')
    .eq('id', patientId).eq('doctor_id', doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const brutes = Array.isArray(body.items) ? body.items.slice(0, MAX_LIGNES) : []
  const lignes = brutes
    .map((l: unknown, i: number) => normaliserLigne(l, i))
    .filter((l: LigneFeuille | null): l is LigneFeuille => l !== null)
  if (lignes.length === 0) {
    return NextResponse.json({ error: 'Ajoutez au moins un acte à la feuille.' }, { status: 400 })
  }

  const careDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.care_date ?? ''))
    ? String(body.care_date)
    : new Date().toISOString().slice(0, 10)

  const { data: feuille, error } = await supabase
    .from('care_sheets')
    .insert({
      doctor_id: doctor.id,
      patient_id: patient.id,
      appointment_id: body.appointment_id ? String(body.appointment_id) : null,
      // L'organisme vient de la fiche, sauf si le médecin en choisit un autre
      // sur cette feuille (un patient peut changer de couverture).
      insurer: body.insurer ? String(body.insurer).slice(0, 60) : (patient.mutuelle ?? null),
      insured_name: body.insured_name ? String(body.insured_name).slice(0, 120) : (patient.insured_name ?? null),
      insured_number: body.insured_number ? String(body.insured_number).slice(0, 40) : (patient.insured_number ?? null),
      insured_relation: body.insured_relation ? String(body.insured_relation).slice(0, 40) : (patient.insured_relation ?? null),
      care_date: careDate,
      total: totalFeuille(lignes),
      notes: body.notes ? String(body.notes).slice(0, 500) : null,
    })
    .select('*')
    .single()

  if (error || !feuille) {
    if (error?.code === TABLE_ABSENTE) return NextResponse.json({ error: FEUILLE_NON_ACTIVEE }, { status: 503 })
    console.error('[Feuille de soins] création impossible :', error?.message)
    return NextResponse.json({ error: "La feuille n'a pas pu être créée" }, { status: 500 })
  }

  const { error: errItems } = await supabase.from('care_sheet_items').insert(
    lignes.map((l: LigneFeuille) => ({ ...l, sheet_id: feuille.id, doctor_id: doctor.id })),
  )
  if (errItems) {
    // Une feuille sans ses actes est un document faux : on ne la laisse pas
    // derrière nous.
    await supabase.from('care_sheets').delete().eq('id', feuille.id).eq('doctor_id', doctor.id)
    console.error('[Feuille de soins] actes non enregistrés :', errItems.message)
    return NextResponse.json({ error: "Les actes n'ont pas pu être enregistrés" }, { status: 500 })
  }

  return NextResponse.json({ ...feuille, items: lignes }, { status: 201 })
}
