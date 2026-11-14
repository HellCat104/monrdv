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
const COLONNE_ABSENTE = new Set(['42703', 'PGRST204'])
const COLONNES_BASE = 'id, tooth, states_before, states_after, note, actor_role, actor_email, created_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  // Les faces (v66), les natures et la séance (v100) étaient écrites mais
  // jamais RELUES : un changement de face disparaissait de l'historique dès
  // le rechargement. On les lit, du plus complet au plus ancien schéma de
  // table, pour qu'une migration en retard coûte une colonne, pas la liste.
  const SCHEMAS = [
    `${COLONNES_BASE}, faces_before, faces_after, natures_before, natures_after, appointment_id`,
    `${COLONNES_BASE}, faces_before, faces_after`,
    COLONNES_BASE,
  ]
  let data: Record<string, unknown>[] | null = null
  let error: { code?: string; message: string } | null = null
  for (const colonnes of SCHEMAS) {
    const r = await admin
      .from('tooth_history')
      .select(colonnes)
      .eq('doctor_id', ctx.doctorId)
      .eq('patient_id', ctx.patientId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_MAX)
    data = r.data as Record<string, unknown>[] | null
    error = r.error
    if (!error || !COLONNE_ABSENTE.has(error.code ?? '')) break
  }

  // La table peut ne pas exister si la migration v55 n'a pas encore été passée :
  // l'odontogramme doit continuer de fonctionner sans son historique plutôt que
  // de tomber en panne.
  if (error) return NextResponse.json({ history: [], indisponible: true })
  return NextResponse.json({
    history: (data ?? []).map((r) => parseToothEvent(r as Parameters<typeof parseToothEvent>[0])),
  })
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
    // normalizeTeeth() a déjà filtré les faces : état inconnu, face inventée ou
    // face posée sur un état qui n'en accepte pas ne sont plus là.
    // Natures et dates passent par le même filtre que le reste : normalizeTeeth
    // les a déjà bornées aux états présents et aux valeurs connues. Les omettre
    // ici reviendrait à les perdre à l'enregistrement, et le praticien verrait
    // son « à faire » redevenir « constaté » au rechargement suivant.
    teeth[k] = {
      s: v.s,
      ...(note ? { n: note } : {}),
      ...(v.f ? { f: v.f } : {}),
      ...(v.p ? { p: v.p } : {}),
      ...(v.d ? { d: v.d } : {}),
    }
  }

  const admin = createAdminClient()

  // LA SÉANCE. Quand le schéma est modifié depuis une consultation, le
  // changement est rattaché à ce rendez-vous : c'est ce qui permet au
  // dossier de dire, pour une visite passée, ce qui a été fait sur quelles
  // dents ce jour-là. Le rendez-vous doit être celui de CE patient, dans CE
  // cabinet — un identifiant inventé est ignoré, pas suivi.
  let appointmentId: string | null = null
  const brut = typeof body?.appointment_id === 'string' ? body.appointment_id : ''
  if (UUID.test(brut)) {
    const { data: rdv } = await admin
      .from('appointments').select('id')
      .eq('id', brut).eq('doctor_id', ctx.doctorId).eq('patient_id', ctx.patientId)
      .maybeSingle()
    appointmentId = rdv?.id ?? null
  }

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

  // Trois générations de la table, de la plus récente à la plus ancienne :
  //   v100 — natures et séance ; v66 — faces ; v55 — états seuls.
  type Niveau = 'v100' | 'v66' | 'v55'
  const ligneHistorique = (c: (typeof changes)[number], niveau: Niveau) => ({
    doctor_id: ctx.doctorId,
    patient_id: ctx.patientId,
    tooth: c.tooth,
    states_before: c.before,
    states_after: c.after,
    // Colonnes de la v66. Tant qu'elle n'est pas passée, l'insertion est
    // rejouée sans elles : le journal perd la face, jamais la ligne.
    ...(niveau !== 'v55' ? { faces_before: c.facesBefore, faces_after: c.facesAfter } : {}),
    ...(niveau === 'v100'
      ? { natures_before: c.naturesBefore, natures_after: c.naturesAfter, appointment_id: appointmentId }
      : {}),
    note: c.note,
    // L'odontogramme n'est affiché qu'au praticien (PatientDossier et la
    // fiche patient) ; la colonne accepte 'secretaire' pour le jour où le
    // secrétariat y accédera, mais aucun chemin ne l'écrit aujourd'hui.
    actor_role: 'medecin',
    actor_user_id: ctx.userId,
    actor_email: ctx.email,
  })

  const COLONNES_LUES: Record<Niveau, string> = {
    v100: `${COLONNES_BASE}, faces_before, faces_after, natures_before, natures_after, appointment_id`,
    v66: `${COLONNES_BASE}, faces_before, faces_after`,
    v55: COLONNES_BASE,
  }

  // Avant la v100, la base refusait une ligne dont SEULES les faces ou la
  // nature changeaient (contrainte `tooth_history_modification_reelle`). On
  // ne lui envoie donc ces lignes-là qu'à partir de la v100 : sinon tout le
  // lot était rejeté, et le journal perdait aussi les vrais changements
  // d'état faits dans le même enregistrement.
  const aEcrire = (niveau: Niveau) => (niveau === 'v100'
    ? changes
    : changes.filter((c) => c.before.join() !== c.after.join()))

  let inserted: Record<string, unknown>[] | null = null
  let histError: { code?: string; message: string } | null = null
  for (const niveau of ['v100', 'v66', 'v55'] as Niveau[]) {
    const lignes = aEcrire(niveau)
    if (lignes.length === 0) { inserted = []; histError = null; break }
    const r = await admin
      .from('tooth_history')
      .insert(lignes.map((c) => ligneHistorique(c, niveau)))
      .select(COLONNES_LUES[niveau])
    inserted = r.data as Record<string, unknown>[] | null
    histError = r.error
    if (!histError || !COLONNE_ABSENTE.has(histError.code ?? '')) break
  }

  // Même arbitrage que lib/audit.ts : un journal muet doit se voir dans les
  // logs, mais on ne rejette pas un enregistrement clinique déjà écrit parce
  // que sa trace a échoué — perdre l'état de la dent serait pire que perdre sa
  // trace. Le drapeau remonte au client, qui le signale au praticien.
  if (histError) {
    console.error('[historique dentaire] écriture impossible :', histError.message)
    return NextResponse.json({ ok: true, events: [], journal: false })
  }

  return NextResponse.json({
    ok: true,
    events: (inserted ?? []).map((r) => parseToothEvent(r as Parameters<typeof parseToothEvent>[0])),
  })
}
