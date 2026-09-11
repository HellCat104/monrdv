// Fiches patients côté secrétaire : liste (coordonnées), création (CIN, mutuelle),
// suppression et export — chaque action contrôlée par les permissions.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { formatPhoneMaroc, isValidPhoneMaroc, ageFromBirthDate, getNowInMaroc } from '@/lib/utils'
import { proposerCreneauLibere, creneauDuRdv } from '@/lib/waitlist'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

const sanitize = (s: string) => s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
// Neutralise les jokers LIKE (% et _) dans les recherches de doublon
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

// GET — liste des patients (coordonnées + CIN/mutuelle, jamais le médical ici)
export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.patients_contact) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })

  const admin = createAdminClient()
  const colonnes = 'id, first_name, last_name, phone, age, cin, mutuelle, created_at'
  const lire = (select: string) => admin
    .from('patients').select(select).eq('doctor_id', ctx.doctor.id).order('created_at', { ascending: false })

  // `email_bounce_reason` (v59) : la liste signale d'un mot les fiches dont
  // l'adresse ne reçoit rien, pour que la secrétaire n'ait pas à ouvrir chaque
  // fiche pour le découvrir. L'adresse elle-même n'est lue que dans le détail.
  let res = await lire(`${colonnes}, email_bounce_reason`)
  // Colonne absente (code déployé avant la migration v59) : la liste d'avant,
  // sans l'indicateur, plutôt qu'aucune liste du tout.
  if (res.error && colonneAbsente(res.error)) res = await lire(colonnes)
  // Une erreur de lecture ressemblait à « aucun patient » : l'écran de la
  // secrétaire affichait une patientèle vide sans rien dire.
  if (res.error) {
    console.error('[cabinet/patients] lecture de la liste impossible :', res.error.message)
    return NextResponse.json({ error: 'Lecture des patients impossible' }, { status: 500 })
  }

  return NextResponse.json({ patients: res.data ?? [], permissions: ctx.permissions })
}

/** 42703 = colonne inconnue (PostgreSQL) ; PGRST204 = colonne absente du cache PostgREST. */
function colonneAbsente(e: { code?: string }): boolean {
  return e.code === '42703' || e.code === 'PGRST204'
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
    .ilike('first_name', escapeLike(first)).ilike('last_name', escapeLike(last)).limit(1).maybeSingle()
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

  // Supprimer la fiche emporte ses rendez-vous (ON DELETE CASCADE) : ceux qui
  // sont à venir libèrent autant de places, sans passer par aucune route
  // d'annulation. On les relit AVANT, puisque après il n'en reste rien.
  const { data: aVenir, error: errAVenir } = await admin.from('appointments')
    .select('id, doctor_id, date, time, duration_minutes, walk_in')
    .eq('patient_id', id).eq('doctor_id', ctx.doctor.id)
    .gte('date', format(getNowInMaroc(), 'yyyy-MM-dd'))
    .neq('status', 'cancelled')
  if (errAVenir) console.error('[patients] lecture des RDV à venir avant suppression :', errAVenir.message)

  const { data: supprimes, error } = await admin.from('patients')
    .delete().eq('id', id).eq('doctor_id', ctx.doctor.id).select('id')
  if (error) return NextResponse.json({ error: 'Échec de la suppression' }, { status: 500 })
  if (!supprimes || supprimes.length === 0) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  // LISTE D'ATTENTE — seulement une fois la suppression confirmée (ligne
  // renvoyée). proposerCreneauLibere écarte les créneaux passés et ne lève jamais.
  await Promise.allSettled((aVenir ?? []).map((r) => proposerCreneauLibere(creneauDuRdv('suppression', r))))

  return NextResponse.json({ success: true })
}
