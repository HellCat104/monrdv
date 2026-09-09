// API droits patients (loi 09-08) : accès, rectification, effacement
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// GET — Droit d'accès : retourne toutes les données du patient
//
// L'export ne contenait que l'identité de base et les rendez-vous. L'écran
// promet pourtant « toutes les données que MonRDV détient sur vous », et la
// politique de confidentialité « l'ensemble des données vous concernant » —
// alors que « Mon dossier » affiche au même patient ses ordonnances, ses
// constantes et ses vaccins. Un export qui montre moins que l'application
// elle-même ne tient pas la promesse d'un droit d'accès.
//
// Ce qui reste volontairement dehors : `appointments.doctor_notes`, les notes
// personnelles du praticien. Elles ne sont pas destinées au dossier et
// n'entrent pas dans le droit d'accès ; la projection ci-dessous ne les
// demande pas. Les fichiers eux-mêmes ne sont pas embarqués non plus — trop
// lourds pour un JSON — mais leur inventaire l'est, pour que le patient sache
// ce qui existe et puisse le réclamer.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  // Fiche complète : l'identité étendue et le contenu médical saisi par le
  // cabinet font partie des données personnelles du patient.
  const { data: patients } = await adminDb
    .from('patients')
    .select(`id, first_name, last_name, phone, email, is_child, created_at,
             birth_date, age, sex, blood_group, cin, mutuelle, address, notes,
             allergies, chronic_conditions, current_treatments, surgeries,
             vaccines, vaccinations, milestones, gestational_age_weeks,
             parent1_name, parent2_name, parent1_phone, parent2_phone`)
    .eq('user_id', user.id)

  const patientIds = (patients ?? []).map((p: any) => p.id)

  const vide = { data: [] as any[] }
  const [
    aptRes, presRes, certRes, notesRes, vitalsRes, docsRes, recallsRes,
    dentRes, histRes, devisRes, versRes, packsRes,
  ] = patientIds.length === 0
    ? [vide, vide, vide, vide, vide, vide, vide, vide, vide, vide, vide, vide]
    : await Promise.all([
      adminDb.from('appointments')
        .select('id, date, time, status, notes, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('date', { ascending: false }),
      adminDb.from('prescriptions')
        .select('id, content, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('certificates')
        .select('id, type, title, motif, content, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('consultation_notes')
        .select('id, note, signed_at, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('vital_signs')
        .select('id, measured_at, values, created_at')
        .in('patient_id', patientIds).order('measured_at', { ascending: false }),
      // Inventaire des fichiers, pas les fichiers : nom, type, taille, date.
      adminDb.from('patient_documents')
        .select('id, file_name, file_type, file_size, created_at')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('recalls')
        .select('id, due_date, reason, status, sent_at, created_at')
        .in('patient_id', patientIds).order('due_date', { ascending: false }),
      adminDb.from('dental_charts').select('patient_id, teeth, updated_at').in('patient_id', patientIds),
      adminDb.from('tooth_history')
        .select('id, tooth, states_before, states_after, note, created_at')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('quotes')
        .select('id, label, status, notes, created_at, items:quote_items(tooth, label, unit_price, quantity, done, done_at)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('quote_payments')
        .select('id, amount, payment_method, paid_at, invoice_no, note')
        .in('patient_id', patientIds).order('paid_at', { ascending: false }),
      adminDb.from('session_packages')
        .select('id, label, total_sessions, used_sessions, amount, status, created_at')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
    ])

  return NextResponse.json({
    account: { email: user.email, created_at: user.created_at },
    patients: patients ?? [],
    appointments: aptRes.data ?? [],
    ordonnances: presRes.data ?? [],
    certificats: certRes.data ?? [],
    notes_de_consultation: notesRes.data ?? [],
    constantes: vitalsRes.data ?? [],
    documents: docsRes.data ?? [],
    rappels_de_suivi: recallsRes.data ?? [],
    schema_dentaire: dentRes.data ?? [],
    historique_dentaire: histRes.data ?? [],
    devis: devisRes.data ?? [],
    versements: versRes.data ?? [],
    forfaits_de_seances: packsRes.data ?? [],
  })
}

// PATCH — Droit de rectification : modifier téléphone ou email
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { phone, email } = body

  // Validation format
  const phoneRegex = /^\+?[\d\s\-().]{7,20}$/
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (phone && !phoneRegex.test(String(phone).trim())) {
    return NextResponse.json({ error: 'Format de téléphone invalide' }, { status: 400 })
  }
  if (email && !emailRegex.test(String(email).trim())) {
    return NextResponse.json({ error: 'Format d\'email invalide' }, { status: 400 })
  }

  const adminDb = createAdminClient()

  const updates: Record<string, string> = {}
  if (phone) updates.phone = String(phone).trim().substring(0, 20)
  if (email) updates.email = String(email).trim().substring(0, 254)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 })
  }

  await adminDb
    .from('patients')
    .update(updates)
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}

// DELETE — Droit à l'effacement : supprime le compte et les données
export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  // Récupère les IDs patients
  const { data: patients } = await adminDb
    .from('patients')
    .select('id')
    .eq('user_id', user.id)

  const patientIds = (patients ?? []).map((p: any) => p.id)

  // Annule les RDV futurs
  if (patientIds.length > 0) {
    const today = new Date().toISOString().split('T')[0]
    await adminDb
      .from('appointments')
      .update({ status: 'cancelled' })
      .in('patient_id', patientIds)
      .gte('date', today)
      .neq('status', 'cancelled')

    // Anonymise les données patient (ne supprime pas les RDV passés pour le médecin).
    // Efface aussi tout le dossier médical enrichi (loi 09-08 : suppression réelle
    // des données personnelles à la demande de la personne concernée).
    await adminDb
      .from('patients')
      .update({
        first_name: 'Supprimé', last_name: '', phone: '', email: null, user_id: null,
        age: null, notes: null,
        allergies: null, chronic_conditions: null, current_treatments: null,
      })
      .in('id', patientIds)

    // Efface tout le dossier médical rattaché (loi 09-08 : suppression réelle)
    await adminDb.from('consultation_notes').delete().in('patient_id', patientIds)
    await adminDb.from('prescriptions').delete().in('patient_id', patientIds)
    await adminDb.from('vital_signs').delete().in('patient_id', patientIds)
    await adminDb.from('recalls').delete().in('patient_id', patientIds)

    // Documents : supprime les fichiers du stockage PUIS les lignes en base
    const { data: docs } = await adminDb
      .from('patient_documents')
      .select('file_path')
      .in('patient_id', patientIds)
    const paths = (docs ?? []).map((d: { file_path: string }) => d.file_path).filter(Boolean)
    if (paths.length > 0) {
      await adminDb.storage.from('patient-documents').remove(paths)
    }
    await adminDb.from('patient_documents').delete().in('patient_id', patientIds)
  }

  // Supprime le compte auth
  await adminDb.auth.admin.deleteUser(user.id)

  return NextResponse.json({ success: true })
}
