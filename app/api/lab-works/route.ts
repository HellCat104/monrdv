// Travaux de laboratoire — liste (par patient, ou suivi du cabinet) et création.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor, TABLE_ABSENTE, LABO_NON_ACTIVE } from '@/lib/labo-server'
import { LAB_EN_COURS, LAB_STATUTS, type LabStatut } from '@/lib/labo'
import { isValidTooth } from '@/lib/dental'

export const dynamic = 'force-dynamic'

const MAX_DENTS = 16

/** Champs communs à la création et à la modification, assainis une seule fois. */
export function nettoyerTravail(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const texte = (v: unknown, max: number) => {
    const t = String(v ?? '').trim().slice(0, max)
    return t || null
  }
  if ('lab_name' in body) out.lab_name = texte(body.lab_name, 120)
  if ('work_type' in body) out.work_type = texte(body.work_type, 80)
  if ('shade' in body) out.shade = texte(body.shade, 40)
  if ('material' in body) out.material = texte(body.material, 80)
  if ('instructions' in body) out.instructions = texte(body.instructions, 1000)
  if ('notes' in body) out.notes = texte(body.notes, 500)

  if ('teeth' in body) {
    const brut = Array.isArray(body.teeth) ? body.teeth : []
    out.teeth = brut
      .map((t) => String(t).trim())
      .filter((t, i, a) => t && isValidTooth(t) && a.indexOf(t) === i)
      .slice(0, MAX_DENTS)
  }

  for (const cle of ['sent_at', 'due_at', 'received_at'] as const) {
    if (cle in body) {
      const v = String(body[cle] ?? '')
      out[cle] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
    }
  }

  if ('cost' in body) {
    if (body.cost === null || body.cost === '') out.cost = null
    else {
      const n = Number(String(body.cost).replace(',', '.'))
      out.cost = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
    }
  }

  if ('status' in body) {
    const s = String(body.status) as LabStatut
    if (LAB_STATUTS.includes(s)) out.status = s
  }
  return out
}

export async function GET(req: NextRequest) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const patientId = req.nextUrl.searchParams.get('patient_id')
  // `suivi=1` : ce que le cabinet attend encore du laboratoire, tous patients
  // confondus — c'est la vue du lundi matin.
  const suivi = req.nextUrl.searchParams.get('suivi') === '1'

  let requete = supabase
    .from('lab_works')
    .select('*, patient:patients(first_name, last_name)')
    .eq('doctor_id', doctor.id)

  if (patientId) requete = requete.eq('patient_id', patientId).order('created_at', { ascending: false })
  else if (suivi) requete = requete.in('status', LAB_EN_COURS).order('due_at', { ascending: true, nullsFirst: false })
  else return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const { data, error } = await requete
  if (error) {
    if (error.code === TABLE_ABSENTE) return NextResponse.json({ travaux: [], activee: false })
    console.error('[Laboratoire] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ travaux: data ?? [], activee: true })
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

  // Rattachements facultatifs, vérifiés quand ils sont fournis : un travail ne
  // pointe jamais vers le devis ou le rendez-vous d'un autre cabinet.
  let quoteItemId: string | null = null
  if (body.quote_item_id) {
    const { data: ligne } = await supabase
      .from('quote_items').select('id').eq('id', String(body.quote_item_id)).eq('doctor_id', doctor.id).maybeSingle()
    if (!ligne) return NextResponse.json({ error: 'Acte du devis introuvable' }, { status: 404 })
    quoteItemId = ligne.id
  }
  let appointmentId: string | null = null
  if (body.appointment_id) {
    const { data: apt } = await supabase
      .from('appointments').select('id')
      .eq('id', String(body.appointment_id)).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    if (!apt) return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 })
    appointmentId = apt.id
  }

  const { data, error } = await supabase
    .from('lab_works')
    .insert({
      doctor_id: doctor.id,
      patient_id: patient.id,
      quote_item_id: quoteItemId,
      appointment_id: appointmentId,
      ...nettoyerTravail(body),
    })
    .select('*')
    .single()

  if (error || !data) {
    if (error?.code === TABLE_ABSENTE) return NextResponse.json({ error: LABO_NON_ACTIVE }, { status: 503 })
    console.error('[Laboratoire] création impossible :', error?.message)
    return NextResponse.json({ error: "Le travail n'a pas pu être enregistré" }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
