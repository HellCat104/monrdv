// Traitements orthodontiques — liste par patient et ouverture d'un traitement.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor } from '@/lib/labo-server'
import { nettoyerTraitement } from '@/lib/ortho'
import { tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'


const ORTHO_NON_ACTIVE =
  "Le suivi orthodontique n'est pas encore activé sur votre base (migration v70)."


export async function GET(req: NextRequest) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const patientId = req.nextUrl.searchParams.get('patient_id')
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const { data, error } = await supabase
    .from('ortho_treatments')
    .select('*, visits:ortho_visits(id, visit_date, act, wire, next_visit, notes)')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) {
    if (tableAbsente(error.code)) return NextResponse.json({ traitements: [], activee: false })
    console.error('[Ortho] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ traitements: data ?? [], activee: true })
}

export async function POST(req: NextRequest) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const patientId = body.patient_id ? String(body.patient_id) : ''
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const { data: patient } = await supabase
    .from('patients').select('id').eq('id', patientId).eq('doctor_id', doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  // Devis rattaché, facultatif : c'est lui qui porte l'argent et l'échéancier.
  let quoteId: string | null = null
  if (body.quote_id) {
    const { data: devis } = await supabase
      .from('quotes').select('id').eq('id', String(body.quote_id))
      .eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    if (!devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    quoteId = devis.id
  }

  const { data, error } = await supabase
    .from('ortho_treatments')
    .insert({ doctor_id: doctor.id, patient_id: patient.id, quote_id: quoteId, ...nettoyerTraitement(body) })
    .select('*, visits:ortho_visits(id, visit_date, act, wire, next_visit, notes)')
    .single()

  if (error || !data) {
    if (tableAbsente(error?.code)) return NextResponse.json({ error: ORTHO_NON_ACTIVE }, { status: 503 })
    console.error('[Ortho] ouverture impossible :', error?.message)
    return NextResponse.json({ error: "Le traitement n'a pas pu être ouvert" }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
