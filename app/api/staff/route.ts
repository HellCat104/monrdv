// Gestion de l'équipe (secrétaires) par le médecin propriétaire.
// GET : liste · POST : inviter/créer · PATCH : permissions/nom/statut · DELETE : retirer
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendStaffInviteEmail } from '@/lib/email'
import { DEFAULT_STAFF_PERMISSIONS, type StaffPermissions } from '@/types'
import { canAccess } from '@/lib/plan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Nettoie l'objet permissions reçu : uniquement des booléens sur des clés connues.
function sanitizePerms(input: unknown, plan?: string | null): StaffPermissions {
  const src = (input ?? {}) as Record<string, unknown>
  const out = { ...DEFAULT_STAFF_PERMISSIONS }
  for (const k of Object.keys(DEFAULT_STAFF_PERMISSIONS) as (keyof StaffPermissions)[]) {
    if (k in src) out[k] = Boolean(src[k])
  }
  // Une permission que le forfait ne couvre pas n'est pas enregistrée : elle
  // resterait cochée en base et se réveillerait à la montée en gamme, sans
  // décision consciente du praticien.
  if (!canAccess(plan, 'records')) { out.patients_medical = false; out.vitals_entry = false }
  if (!canAccess(plan, 'prescriptions')) out.prescriptions_view = false
  if (!canAccess(plan, 'invoicing')) out.factures = false
  return out
}

function randomPassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
}

// Résout le médecin connecté (propriétaire). null si l'appelant n'est pas médecin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDoctor(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { data: doctor } = await supabase
    .from('doctors').select('id, name, email, status, plan').eq('email', user.email).single()
  if (!doctor || doctor.status !== 'approved') return null
  return doctor
}

export async function GET() {
  const supabase = createClient()
  const doctor = await getDoctor(supabase)
  if (!doctor) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data } = await supabase
    .from('cabinet_staff').select('*').eq('doctor_id', doctor.id).order('created_at', { ascending: true })
  return NextResponse.json({ staff: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const doctor = await getDoctor(supabase)
  if (!doctor) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const permissions = sanitizePerms(body.permissions, doctor.plan)
  // Le médecin peut fixer le mot de passe initial — c'est ce que faisait le
  // formulaire d'inscription avant que la création de compte n'en soit retirée.
  // À défaut, on en génère un et on le lui communique par e-mail.
  const chosen = typeof body.password === 'string' ? body.password : ''
  if (chosen && chosen.length < 8) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 })
  }

  if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'E-mail invalide' }, { status: 400 })
  if (email === doctor.email.toLowerCase()) return NextResponse.json({ error: 'Cet e-mail est celui du médecin.' }, { status: 400 })

  // Le compte auth de la secrétaire (créé si nouveau, sinon on réutilise l'existant).
  const admin = createAdminClient()
  let tempPassword: string | undefined = chosen || randomPassword()
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: 'staff', name },
  })
  if (createErr) {
    const msg = (createErr.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      tempPassword = undefined // compte déjà existant : il gardera son mot de passe
    } else {
      return NextResponse.json({ error: 'Création du compte impossible : ' + createErr.message }, { status: 400 })
    }
  }

  // Lien secrétaire ↔ médecin (RLS : le médecin ne peut créer que pour lui-même)
  const { data: row, error: insErr } = await supabase
    .from('cabinet_staff')
    .insert({ doctor_id: doctor.id, email, name, permissions })
    .select().single()
  if (insErr) {
    if ((insErr.code === '23505') || (insErr.message || '').includes('duplicate')) {
      return NextResponse.json({ error: 'Cette personne fait déjà partie de votre équipe.' }, { status: 409 })
    }
    return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  // Email d'invitation (non bloquant)
  await sendStaffInviteEmail({ to: email, staffName: name, doctorName: doctor.name, tempPassword }).catch(() => {})

  return NextResponse.json({ staff: row, emailed: true })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const doctor = await getDoctor(supabase)
  if (!doctor) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {}
  if (body.permissions !== undefined) patch.permissions = sanitizePerms(body.permissions, doctor.plan)
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (body.status === 'active' || body.status === 'disabled') patch.status = body.status
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })

  const { data, error } = await supabase
    .from('cabinet_staff').update(patch).eq('id', id).eq('doctor_id', doctor.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ staff: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const doctor = await getDoctor(supabase)
  if (!doctor) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  // On retire seulement le lien (on ne supprime pas le compte auth : il peut servir ailleurs)
  const { error } = await supabase.from('cabinet_staff').delete().eq('id', id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
