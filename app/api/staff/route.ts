// Gestion de l'équipe (secrétaires) par le médecin propriétaire.
// GET : liste · POST : inviter/créer · PATCH : permissions/nom/statut, ou
// adresse e-mail (seule) · DELETE : retirer
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
  // Devis (v54) : même famille que le dossier de soins, donc même plafond que
  // `patients_medical` — pas de plan de traitement chiffré dans le forfait Agenda.
  if (!canAccess(plan, 'records')) {
    out.patients_medical = false
    out.vitals_entry = false
    out.quotes_view = false
    out.quotes_payment = false
  }
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

  // L'invitation ne bloque pas l'ajout (la fiche existe, le médecin pourra
  // corriger l'adresse), mais son résultat est RENDU : la page affichait
  // « Invitation envoyée » même quand Resend avait refusé le message.
  const emailed = await sendStaffInviteEmail({ to: email, staffName: name, doctorName: doctor.name, tempPassword })

  return NextResponse.json({ staff: row, emailed })
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ── Changer l'adresse d'une secrétaire ─────────────────────────────────────
//
// Cas d'origine : une faute de frappe à l'invitation (« nadia@icoud.com »).
// Jusqu'ici il fallait retirer la secrétaire et la réinviter, en perdant ses
// permissions réglées case par case.
//
// Ce qu'on change, et ce qu'on ne change PAS :
//  · On garde la FICHE (identifiant, permissions, statut, date d'arrivée) et
//    on change QUELLE ADRESSE ouvre l'accès au cabinet. Le compte de connexion
//    n'est relié à la fiche que par l'adresse (lib/cabinet.ts :
//    getStaffContext cherche `cabinet_staff.email = user.email`, de même que
//    les deux layouts et la policy « Secrétaire : lire sa fiche »). Changer
//    la colonne suffit donc : dès la requête suivante, l'ancienne adresse ne
//    trouve plus de fiche et perd l'accès, la nouvelle le gagne.
//  · On ne modifie JAMAIS un compte de connexion existant (aucun
//    updateUserById sur l'adresse). La même adresse peut être le compte
//    patient de quelqu'un, ou la secrétaire d'un autre cabinet : renommer ce
//    compte déplacerait la connexion d'une autre personne. L'ancien compte
//    reste tel quel ; il perd seulement CE cabinet.
//  · Pour la nouvelle adresse, on crée ou on réutilise un compte exactement
//    comme l'invitation (POST ci-dessus), puis on envoie une invitation.
async function changerAdresse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  doctor: { id: string; name: string; email: string },
  id: string,
  brute: string,
) {
  const email = brute.trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Cette adresse e-mail n’est pas valide. Vérifiez-la (exemple : nom@gmail.com).' }, { status: 400 })
  }
  if (email === doctor.email.toLowerCase()) {
    return NextResponse.json({ error: 'C’est votre propre adresse : votre secrétaire doit avoir la sienne.' }, { status: 400 })
  }

  // La fiche doit appartenir au médecin connecté. La RLS le garantit déjà ;
  // le filtre doctor_id le dit explicitement et donne un 404 lisible.
  const { data: fiche, error: ficheErr } = await supabase
    .from('cabinet_staff').select('id, name, email').eq('id', id).eq('doctor_id', doctor.id).maybeSingle()
  if (ficheErr) return NextResponse.json({ error: 'Lecture de la fiche impossible. Réessayez.' }, { status: 500 })
  if (!fiche) return NextResponse.json({ error: 'Secrétaire introuvable dans votre équipe.' }, { status: 404 })
  if (String(fiche.email).toLowerCase() === email) {
    return NextResponse.json({ error: 'C’est déjà son adresse actuelle.' }, { status: 400 })
  }

  // Refus AVANT de créer un compte de connexion : sinon on fabriquerait un
  // compte pour rien. L'index unique (doctor_id, lower(email)) reste le
  // dernier mot en cas de course (voir le 23505 plus bas).
  const { data: doublon, error: doublonErr } = await supabase
    .from('cabinet_staff').select('id, name').eq('doctor_id', doctor.id).eq('email', email).neq('id', id).limit(1).maybeSingle()
  if (doublonErr) return NextResponse.json({ error: 'Vérification impossible. Réessayez.' }, { status: 500 })
  if (doublon) {
    return NextResponse.json({ error: `Cette adresse est déjà celle de ${doublon.name} dans votre équipe.` }, { status: 409 })
  }

  // Compte de connexion : même règle que l'invitation. Créé s'il n'existe
  // pas ; réutilisé tel quel s'il existe (mot de passe inchangé, adresse
  // inchangée — on n'y touche pas).
  const admin = createAdminClient()
  let tempPassword: string | undefined = randomPassword()
  let compteCreeId: string | null = null
  const { data: cree, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: 'staff', name: fiche.name },
  })
  if (createErr) {
    const msg = (createErr.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      tempPassword = undefined // compte existant : il garde son mot de passe
    } else {
      return NextResponse.json({ error: 'Création de l’accès impossible : ' + createErr.message }, { status: 400 })
    }
  } else {
    compteCreeId = cree?.user?.id ?? null
  }

  // `auth_user_id` (v44) désignait l'ANCIEN compte. Aucun code ne le lit
  // aujourd'hui, mais le laisser pointer vers l'ancienne adresse serait une
  // porte dérobée pour le jour où quelqu'un s'en servira : on l'efface, comme
  // il l'est pour toute secrétaire invitée par l'application.
  // Le drapeau de rebond, lui, est effacé par la base (trigger v59) : la
  // nouvelle adresse n'a pas rebondi.
  const { data: maj, error: majErr } = await supabase
    .from('cabinet_staff')
    .update({ email, auth_user_id: null })
    .eq('id', id).eq('doctor_id', doctor.id)
    .select().maybeSingle()

  if (majErr || !maj) {
    // Le compte fabriqué à l'instant ne sert plus à rien : un compte orphelin
    // au mot de passe inconnu piégerait une invitation future à cette adresse
    // (« connectez-vous avec votre mot de passe habituel » — elle n'en a
    // jamais eu). On ne supprime QUE le compte créé par CETTE requête, jamais
    // un compte préexistant.
    if (compteCreeId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(compteCreeId)
      if (delErr) console.error('[staff] compte créé pour rien, suppression impossible :', delErr.message)
    }
    if (majErr && (majErr.code === '23505' || (majErr.message || '').includes('duplicate'))) {
      return NextResponse.json({ error: 'Cette adresse est déjà utilisée dans votre équipe.' }, { status: 409 })
    }
    if (majErr) console.error('[staff] changement d’adresse refusé :', majErr.message)
    return NextResponse.json({ error: 'L’adresse n’a pas pu être modifiée. Réessayez.' }, { status: 500 })
  }

  const emailed = await sendStaffInviteEmail({ to: email, staffName: fiche.name, doctorName: doctor.name, tempPassword })
  return NextResponse.json({ staff: maj, emailed })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const doctor = await getDoctor(supabase)
  if (!doctor) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  // Changer l'adresse est une opération à part (compte de connexion,
  // invitation, perte d'accès de l'ancienne adresse) : elle ne se mélange pas
  // à un réglage de permissions. Plutôt que d'ignorer en silence les autres
  // champs, on refuse la combinaison.
  if (body.email !== undefined) {
    if (typeof body.email !== 'string') return NextResponse.json({ error: 'Adresse e-mail invalide' }, { status: 400 })
    if (body.permissions !== undefined || body.name !== undefined || body.status !== undefined) {
      return NextResponse.json({ error: 'Modifiez l’adresse séparément des autres réglages.' }, { status: 400 })
    }
    return changerAdresse(supabase, doctor, id, body.email)
  }

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
