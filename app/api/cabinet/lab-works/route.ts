// Travaux de laboratoire — côté secrétariat.
//
// CE QUE CETTE ROUTE FAIT, ET SURTOUT CE QU'ELLE NE FAIT PAS
//
// C'est la secrétaire qui appelle le prothésiste : elle doit pouvoir dire
// « c'est parti lundi », « c'est revenu », « ils annoncent jeudi ». Elle n'a
// en revanche rien à faire du COÛT facturé par le laboratoire, ni de la
// création ou de la suppression d'un travail — décider d'une prothèse et de
// son prix est un acte du praticien.
//
// La route n'offre donc que deux verbes, et le PATCH n'accepte que trois
// champs. Ce n'est pas l'écran qui masque le reste : il n'existe pas ici.
import { NextRequest, NextResponse } from 'next/server'
import { getStaffContext } from '@/lib/cabinet'
import { createAdminClient } from '@/lib/supabase/server'
import { LAB_EN_COURS, LAB_STATUTS, type LabStatut } from '@/lib/labo'
import { tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

/** 42P01 = table absente (migration v68 non passée). */


// Colonnes renvoyées au secrétariat : ni `cost`, ni `cost_expense_id`.
const COLONNES =
  'id, patient_id, work_type, teeth, lab_name, shade, material, instructions, sent_at, due_at, received_at, status, appointment_id'

export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.lab_works) {
    return NextResponse.json({ error: 'Permission manquante (laboratoire)' }, { status: 403 })
  }

  const admin = createAdminClient()
  const patientId = req.nextUrl.searchParams.get('patient_id')

  let requete = admin
    .from('lab_works')
    .select(`${COLONNES}, patient:patients(first_name, last_name)`)
    .eq('doctor_id', ctx.doctor.id)

  if (patientId) requete = requete.eq('patient_id', patientId).order('created_at', { ascending: false })
  // Par défaut : ce que le cabinet attend encore du laboratoire.
  else requete = requete.in('status', LAB_EN_COURS).order('due_at', { ascending: true, nullsFirst: false })

  const { data, error } = await requete
  if (error) {
    if (tableAbsente(error.code)) return NextResponse.json({ travaux: [], activee: false })
    console.error('[cabinet/lab-works] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ travaux: data ?? [], activee: true })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.lab_works) {
    return NextResponse.json({ error: 'Permission manquante (laboratoire)' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'Travail manquant' }, { status: 400 })

  const admin = createAdminClient()
  const { data: travail } = await admin
    .from('lab_works').select('id, sent_at, received_at, status')
    .eq('id', id).eq('doctor_id', ctx.doctor.id).maybeSingle()
  if (!travail) return NextResponse.json({ error: 'Travail introuvable' }, { status: 404 })

  const patch: Record<string, unknown> = {}

  if ('status' in body) {
    const s = String(body.status) as LabStatut
    if (!LAB_STATUTS.includes(s)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    // « Annulé » n'est pas à la main du secrétariat : renoncer à une prothèse
    // engage le plan de traitement, et parfois un acompte déjà versé.
    if (s === 'annule') {
      return NextResponse.json({ error: 'L\'annulation d\'un travail revient au praticien.' }, { status: 403 })
    }
    patch.status = s
  }

  for (const cle of ['due_at', 'sent_at', 'received_at'] as const) {
    if (cle in body) {
      const v = String(body[cle] ?? '')
      patch[cle] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  // Mêmes automatismes que côté praticien : cliquer « envoyé » un lundi, c'est
  // que c'est parti ce lundi-là.
  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (patch.status === 'envoye' && !travail.sent_at && !('sent_at' in body)) patch.sent_at = aujourdhui
  if (patch.status === 'recu' && !travail.received_at && !('received_at' in body)) patch.received_at = aujourdhui
  patch.updated_at = new Date().toISOString()

  const { data, error } = await admin
    .from('lab_works').update(patch).eq('id', travail.id).eq('doctor_id', ctx.doctor.id)
    .select(COLONNES).single()

  if (error || !data) {
    console.error('[cabinet/lab-works] modification impossible :', error?.message)
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  return NextResponse.json(data)
}
