// Odontogramme d'un patient : enregistrement du schéma (POST) et lecture de
// l'historique par dent (GET). `[id]` est l'identifiant du patient.
//
// POURQUOI LE CALCUL DE DIFFÉRENCE EST ICI, ET PAS DANS LE NAVIGATEUR
//
// 1. Un journal dont le contenu est dicté par le client ne prouve rien. Le
//    navigateur enverrait « voici ce que j'ai changé » ; il pourrait tout aussi
//    bien envoyer « je n'ai rien changé », ou une transition inventée. Ici, la
//    ligne d'historique est déduite de ce qui est RÉELLEMENT en base à l'instant
//    de l'écriture : personne ne choisit ce qu'il journalise.
// 2. L'écriture et sa trace partent du même appel. Un enregistrement du schéma
//    sans ligne d'historique correspondante devient impossible par construction
//    — et depuis v55 le navigateur n'a plus le droit d'écrire `dental_charts`,
//    donc il n'existe plus de chemin qui contourne ce calcul.
// 3. L'odontogramme s'enregistre de façon débouncée, parfois depuis deux
//    onglets. En comparant à l'état lu juste avant l'écriture, la chaîne
//    d'événements reste cohérente même si les enregistrements se croisent ;
//    un diff calculé dans le navigateur compare, lui, à un état déjà périmé.
//
// Le forfait est vérifié côté serveur (canAccess(plan, 'records')), comme pour
// app/api/audit/patient/[id] : le schéma dentaire fait partie du dossier
// médical, et un contrôle qui ne vit que dans l'affichage n'est pas un contrôle.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isValidTooth, normalizeTeeth, type DentalTeeth, type StoredDentalTeeth } from '@/lib/dental'
import { diffTeeth, parseToothEvent } from '@/lib/dental-history'

export const dynamic = 'force-dynamic'

// Longueur maximale d'une note de dent. Le champ est libre ; la base ne le
// borne pas. Sans plafond, une note collée par erreur (un dossier entier) part
// à l'identique dans CHAQUE ligne d'historique de la dent.
const NOTE_MAX = 300
// L'historique est lu d'un bloc au chargement de l'odontogramme, puis filtré
// dent par dent à l'écran : un seul aller-retour plutôt qu'un par dent cliquée.
const HISTORY_MAX = 400

/** Contexte commun aux deux verbes : médecin connecté, forfait, patient à lui. */
async function resolveContext(patientId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }

  if (!canAccess(doctor.plan, 'records')) {
    return { error: NextResponse.json({ error: 'Votre forfait ne donne pas accès au dossier médical' }, { status: 403 }) }
  }

  // Le patient doit appartenir au cabinet : sans ce contrôle, l'historique
  // révélerait l'existence de dossiers d'autres médecins.
  const { data: patient } = await supabase
    .from('patients').select('id').eq('id', patientId).eq('doctor_id', doctor.id).maybeSingle()
  if (!patient) return { error: NextResponse.json({ error: 'Patient introuvable' }, { status: 404 }) }

  return { doctorId: doctor.id, patientId: patient.id, userId: user.id, email: user.email ?? null }
}

// GET — l'historique du patient, du plus récent au plus ancien.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveContext(params.id)
  if ('error' in ctx) return ctx.error

  // `tooth_history` est sous RLS sans aucune policy (v55) : elle n'est
  // accessible qu'au service_role, jamais depuis le navigateur.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tooth_history')
    .select('id, tooth, states_before, states_after, note, actor_role, actor_email, created_at')
    .eq('doctor_id', ctx.doctorId)
    .eq('patient_id', ctx.patientId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_MAX)

  // La table peut ne pas exister si la migration v55 n'a pas encore été passée :
  // l'odontogramme doit continuer de fonctionner sans son historique plutôt que
  // de tomber en panne.
  if (error) return NextResponse.json({ history: [], indisponible: true })
  return NextResponse.json({ history: (data ?? []).map(parseToothEvent) })
}

// POST — enregistre le schéma et journalise les dents réellement modifiées.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveContext(params.id)
  if ('error' in ctx) return ctx.error

  const body = await req.json().catch(() => null)
  const raw = body?.teeth
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Schéma invalide' }, { status: 400 })
  }

  // Assainissement : on n'écrit que des numéros FDI valides et des états connus
  // (normalizeTeeth s'en charge), et on borne la note. Une clé fantaisiste
  // ferait sinon échouer l'insertion d'historique (contrainte CHECK sur `tooth`)
  // APRÈS l'écriture du schéma : le journal serait muet sur une modification
  // pourtant enregistrée.
  const teeth: DentalTeeth = {}
  for (const [k, v] of Object.entries(normalizeTeeth(raw as StoredDentalTeeth))) {
    if (!isValidTooth(k)) continue
    const note = v.n?.trim().slice(0, NOTE_MAX)
    teeth[k] = note ? { s: v.s, n: note } : { s: v.s }
  }

  const admin = createAdminClient()

  // L'état de référence, lu à l'instant même de l'écriture : c'est LUI qui fait
  // foi, pas ce que le navigateur croit être l'état précédent.
  const { data: existing } = await admin
    .from('dental_charts').select('teeth').eq('patient_id', ctx.patientId).maybeSingle()
  const changes = diffTeeth(existing?.teeth as StoredDentalTeeth | null, teeth)

  const { error: chartError } = await admin.from('dental_charts').upsert(
    { patient_id: ctx.patientId, doctor_id: ctx.doctorId, teeth, updated_at: new Date().toISOString() },
    { onConflict: 'patient_id' },
  )
  if (chartError) return NextResponse.json({ error: 'Échec de l\'enregistrement' }, { status: 500 })

  if (changes.length === 0) return NextResponse.json({ ok: true, events: [] })

  const { data: inserted, error: histError } = await admin.from('tooth_history').insert(
    changes.map((c) => ({
      doctor_id: ctx.doctorId,
      patient_id: ctx.patientId,
      tooth: c.tooth,
      states_before: c.before,
      states_after: c.after,
      note: c.note,
      // L'odontogramme n'est affiché qu'au praticien (PatientDossier et la
      // fiche patient) ; la colonne accepte 'secretaire' pour le jour où le
      // secrétariat y accédera, mais aucun chemin ne l'écrit aujourd'hui.
      actor_role: 'medecin',
      actor_user_id: ctx.userId,
      actor_email: ctx.email,
    })),
  ).select('id, tooth, states_before, states_after, note, actor_role, actor_email, created_at')

  // Même arbitrage que lib/audit.ts : un journal muet doit se voir dans les
  // logs, mais on ne rejette pas un enregistrement clinique déjà écrit parce
  // que sa trace a échoué — perdre l'état de la dent serait pire que perdre sa
  // trace. Le drapeau remonte au client, qui le signale au praticien.
  if (histError) {
    console.error('[historique dentaire] écriture impossible :', histError.message)
    return NextResponse.json({ ok: true, events: [], journal: false })
  }

  return NextResponse.json({ ok: true, events: (inserted ?? []).map(parseToothEvent) })
}
