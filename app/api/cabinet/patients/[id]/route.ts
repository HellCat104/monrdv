// Détail d'un patient côté secrétaire — champs renvoyés selon les permissions :
// antécédents (patients_medical), ordonnances (prescriptions_view),
// constantes (vitals_entry pour la saisie).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { allVitalDefs, resolveEnabledVitals, type VitalDef } from '@/types'
import { logAccesDossier } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.patients_contact) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })

  const admin = createAdminClient()
  const { data: patient } = await admin.from('patients')
    .select('id, first_name, last_name, phone, age, cin, mutuelle, birth_date, parent1_name, parent1_phone, parent2_name, parent2_phone, primary_contact, allergies, chronic_conditions, current_treatments')
    .eq('id', params.id).eq('doctor_id', ctx.doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  // C'est ici que le journal compte le plus : la secrétaire a le droit d'ouvrir
  // un dossier, aucun contrôle ne peut deviner pourquoi elle le fait. On note
  // ce qu'elle a réellement obtenu, pas seulement qu'elle a regardé.
  await logAccesDossier({
    doctorId: ctx.doctor.id, actorRole: 'secretaire', actorEmail: ctx.email,
    action: 'dossier_consulte', patientId: patient.id,
    extra: {
      medical: ctx.permissions.patients_medical,
      ordonnances: ctx.permissions.prescriptions_view,
    },
  })

  // Le médical n'est renvoyé QUE si la permission est accordée
  const medical = ctx.permissions.patients_medical
    ? { allergies: patient.allergies, chronic_conditions: patient.chronic_conditions, current_treatments: patient.current_treatments }
    : null

  let prescriptions: unknown[] = []
  if (ctx.permissions.prescriptions_view) {
    const { data } = await admin.from('prescriptions')
      .select('id, content, created_at').eq('patient_id', patient.id).order('created_at', { ascending: false })
    prescriptions = data ?? []
  }

  let vitals: unknown[] = []
  let vitalDefs: VitalDef[] = []
  if (ctx.permissions.vitals_entry) {
    const [vRes, dRes] = await Promise.all([
      admin.from('vital_signs').select('id, measured_at, values').eq('patient_id', patient.id).order('measured_at', { ascending: false }).limit(10),
      admin.from('doctors').select('enabled_vitals, specialty, custom_vitals').eq('id', ctx.doctor.id).single(),
    ])
    vitals = vRes.data ?? []
    const defs = allVitalDefs((dRes.data?.custom_vitals as VitalDef[] | null) ?? [])
    const enabled = resolveEnabledVitals(dRes.data?.enabled_vitals, dRes.data?.specialty)
    vitalDefs = defs.filter((d) => enabled.includes(d.key))
  }

  return NextResponse.json({
    patient: {
      id: patient.id, first_name: patient.first_name, last_name: patient.last_name,
      phone: patient.phone, age: patient.age, cin: patient.cin, mutuelle: patient.mutuelle,
      birth_date: patient.birth_date,
      // Contacts des parents (pédiatrie) : la secrétaire appelle le parent, pas l'enfant
      parent1_name: patient.parent1_name, parent1_phone: patient.parent1_phone,
      parent2_name: patient.parent2_name, parent2_phone: patient.parent2_phone,
      primary_contact: patient.primary_contact,
    },
    medical,
    prescriptions,
    vitals,
    vitalDefs,
    permissions: ctx.permissions,
  })
}

// POST — saisir une mesure de constantes (permission vitals_entry)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.vitals_entry) return NextResponse.json({ error: 'Permission manquante (constantes)' }, { status: 403 })

  const admin = createAdminClient()
  const { data: patient } = await admin.from('patients')
    .select('id').eq('id', params.id).eq('doctor_id', ctx.doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const raw = (body.values ?? {}) as Record<string, unknown>
  const values: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0 && n < 10000 && /^[\w-]{1,50}$/.test(k)) values[k] = n
  }
  if (Object.keys(values).length === 0) return NextResponse.json({ error: 'Aucune mesure valide' }, { status: 400 })

  const { data, error } = await admin.from('vital_signs')
    .insert({ doctor_id: ctx.doctor.id, patient_id: patient.id, values })
    .select('id, measured_at, values').single()
  if (error || !data) return NextResponse.json({ error: 'Échec de l\'enregistrement' }, { status: 500 })

  return NextResponse.json({ vital: data }, { status: 201 })
}
