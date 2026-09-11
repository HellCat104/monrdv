// Détail d'un patient côté secrétaire — champs renvoyés selon les permissions :
// antécédents (patients_medical), ordonnances (prescriptions_view),
// constantes (vitals_entry pour la saisie). PATCH : correction de l'adresse
// e-mail seule (patients_contact).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { allVitalDefs, resolveEnabledVitals, type VitalDef } from '@/types'
import { logAccesDossier } from '@/lib/audit'

export const dynamic = 'force-dynamic'

interface FicheLue {
  id: string; first_name: string; last_name: string; phone: string
  age: number | null; cin: string | null; mutuelle: string | null; birth_date: string | null
  parent1_name: string | null; parent1_phone: string | null
  parent2_name: string | null; parent2_phone: string | null; primary_contact: string | null
  allergies: string | null; chronic_conditions: string | null; current_treatments: string | null
  email: string | null
  email_bounced_at?: string | null
  email_bounce_reason?: string | null
}

/** 42703 = colonne inconnue (PostgreSQL) ; PGRST204 = colonne absente du cache PostgREST. */
function colonneAbsente(e: { code?: string }): boolean {
  return e.code === '42703' || e.code === 'PGRST204'
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.patients_contact) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })

  const admin = createAdminClient()
  // L'e-mail est une coordonnée, comme le téléphone : la permission
  // « Fiches patients (coordonnées) » la couvre, et la secrétaire la saisit
  // déjà à la prise de rendez-vous. Il remonte ici avec le drapeau de rebond
  // (v59), pour qu'elle voie — et corrige — l'adresse qui ne reçoit rien.
  const base = 'id, first_name, last_name, phone, age, cin, mutuelle, birth_date, parent1_name, parent1_phone, parent2_name, parent2_phone, primary_contact, allergies, chronic_conditions, current_treatments, email'
  const lire = (select: string) => admin.from('patients')
    .select(select).eq('id', params.id).eq('doctor_id', ctx.doctor.id).maybeSingle()
  let res = await lire(`${base}, email_bounced_at, email_bounce_reason`)
  // Code déployé avant la migration v59 : la fiche d'avant, sans le drapeau.
  if (res.error && colonneAbsente(res.error)) res = await lire(base)
  if (res.error) {
    console.error('[cabinet/patients/id] lecture impossible :', res.error.message)
    return NextResponse.json({ error: 'Lecture de la fiche impossible' }, { status: 500 })
  }
  const patient = res.data as unknown as FicheLue | null
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
      // Les devis ne passent pas par cette route (ils ont la leur, qui
      // journalise sa propre lecture) : on note seulement si la fiche ouverte
      // était en mesure de les afficher.
      devis: ctx.permissions.quotes_view,
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
      email: patient.email,
      email_bounced_at: patient.email_bounced_at ?? null,
      email_bounce_reason: patient.email_bounce_reason ?? null,
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

// PATCH — corriger l'adresse e-mail d'un patient (permission « coordonnées »).
//
// C'est la secrétaire qui a le patient au bout du fil ou au comptoir : c'est
// elle qui peut lui redemander la bonne adresse. Lui montrer « cette adresse
// ne fonctionne pas » sans lui permettre de la corriger l'aurait laissée
// devant un avertissement sans issue.
//
// Seule l'adresse est modifiable ici, rien d'autre : cet écran n'a jamais
// édité les fiches, et ce lot n'a pas à en faire un formulaire complet.
// Le drapeau de rebond est effacé par la base (trigger v59) si l'adresse
// change réellement — pas par cette route.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.patients_contact) return NextResponse.json({ error: 'Permission manquante' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (typeof body.email !== 'string') return NextResponse.json({ error: 'Adresse e-mail manquante' }, { status: 400 })
  const saisie = body.email.trim().toLowerCase().replace(/[\x00-\x1F\x7F]/g, '')
  // Vide = « ce patient n'a pas d'e-mail » : une correction légitime, qui vaut
  // mieux qu'une adresse qui rebondit.
  const email = saisie || null
  if (email && (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return NextResponse.json({ error: 'Cette adresse e-mail n’est pas valide. Vérifiez-la (exemple : nom@gmail.com).' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ecrire = (select: string) => admin.from('patients')
    .update({ email }).eq('id', params.id).eq('doctor_id', ctx.doctor.id).select(select).maybeSingle()
  // UPDATE … RETURNING est une seule instruction : si la colonne v59 manque,
  // RIEN n'est écrit, et le second essai refait l'écriture sans elle.
  let res = await ecrire('id, email, email_bounced_at, email_bounce_reason')
  if (res.error && colonneAbsente(res.error)) res = await ecrire('id, email')
  if (res.error) {
    console.error('[cabinet/patients/id] correction d’adresse impossible :', res.error.message)
    return NextResponse.json({ error: 'L’adresse n’a pas pu être enregistrée. Réessayez.' }, { status: 500 })
  }
  if (!res.data) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const fiche = res.data as unknown as { id: string; email: string | null; email_bounced_at?: string | null; email_bounce_reason?: string | null }
  return NextResponse.json({
    patient: {
      id: fiche.id,
      email: fiche.email,
      email_bounced_at: fiche.email_bounced_at ?? null,
      email_bounce_reason: fiche.email_bounce_reason ?? null,
    },
  })
}
