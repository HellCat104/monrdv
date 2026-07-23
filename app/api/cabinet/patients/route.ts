// Fiches patients côté secrétaire : liste (coordonnées), création (CIN, mutuelle),
// suppression et export — chaque action contrôlée par les permissions.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { formatPhoneMaroc, isValidPhoneMaroc, ageFromBirthDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const sanitize = (s: string) => s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

// GET — liste des patients (coordonnées + CIN/mutuelle, jamais le médical ici)
export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.patients_contact) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('patients')
    .select('id, first_name, last_name, phone, age, cin, mutuelle, created_at')
    .eq('doctor_id', ctx.doctor.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ patients: data ?? [], permissions: ctx.permissions })
}

// POST — créer une fiche patient (accueil)
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.patients_contact) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const first = sanitize(String(body.first_name ?? '')).substring(0, 100)
  const last = sanitize(String(body.last_name ?? '')).substring(0, 100)
  const phone = sanitize(String(body.phone ?? '')).substring(0, 20)
  const cin = body.cin ? sanitize(String(body.cin)).substring(0, 20).toUpperCase() : null
  const mutuelle = body.mutuelle ? sanitize(String(body.mutuelle)).substring(0, 50) : null
  // Date de naissance (indispensable en pédiatrie : courbes, vaccins, développement).
  // Quand elle est fournie, l'âge en découle — une seule source de vérité.
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.birth_date ?? '')) ? String(body.birth_date) : null
  const age = ageFromBirthDate(birthDate)
    ?? (Number.isInteger(body.age) && body.age > 0 && body.age <= 120 ? body.age : null)

  if (!first || !last || !phone) return NextResponse.json({ error: 'Prénom, nom et téléphone requis' }, { status: 400 })
  if (!isValidPhoneMaroc(phone)) return NextResponse.json({ error: 'Numéro de téléphone invalide (format marocain)' }, { status: 400 })

  const admin = createAdminClient()
  const formattedPhone = formatPhoneMaroc(phone)

  // Anti-doublon : même téléphone + prénom + nom → fiche existante
  const { data: existing } = await admin.from('patients')
    .select('id').eq('doctor_id', ctx.doctor.id).eq('phone', formattedPhone)
    .ilike('first_name', first).ilike('last_name', last).limit(1).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Ce patient existe déjà dans la base.' }, { status: 409 })

  const { data: created, error } = await admin.from('patients')
    .insert({ doctor_id: ctx.doctor.id, first_name: first, last_name: last, phone: formattedPhone, cin, mutuelle, age, birth_date: birthDate })
    .select('id, first_name, last_name, phone, age, birth_date, cin, mutuelle, created_at').single()
  if (error || !created) return NextResponse.json({ error: 'Erreur création patient' }, { status: 500 })

  return NextResponse.json({ patient: created }, { status: 201 })
}

// DELETE ?id= — suppression d'un dossier (permission « sécurité » explicite)
export async function DELETE(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.delete_patient) {
    return NextResponse.json({ error: 'Le médecin ne vous a pas donné la permission de supprimer des dossiers.' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const admin = createAdminClient()
  // Bloque la suppression si le patient a des RDV facturés (piste comptable)
  const { data: invoiced } = await admin.from('appointments')
    .select('id').eq('patient_id', id).eq('doctor_id', ctx.doctor.id)
    .not('invoice_no', 'is', null).limit(1).maybeSingle()
  if (invoiced) {
    return NextResponse.json({ error: 'Ce patient a des factures : suppression réservée au médecin.' }, { status: 409 })
  }

  const { error } = await admin.from('patients').delete().eq('id', id).eq('doctor_id', ctx.doctor.id)
  if (error) return NextResponse.json({ error: 'Échec de la suppression' }, { status: 500 })
  return NextResponse.json({ success: true })
}
