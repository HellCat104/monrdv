// Logo du cabinet (migration v57) : lecture (GET), téléversement (POST),
// suppression (DELETE). Réservé au médecin connecté, sur SON propre logo.
//
// ── POURQUOI TOUT PASSE PAR ICI, ET PAS PAR LE NAVIGATEUR ───────────────────
//
// La photo de profil est envoyée directement du navigateur vers le stockage.
// Deux défauts en ont découlé : la règle d'écriture du dépôt a laissé pendant
// des mois n'importe quel compte écraser la photo de n'importe quel médecin
// (v53), et `handlePhotoUpload` ne vérifie pas que l'adresse a bien été
// enregistrée — la photo s'affiche, puis disparaît au rechargement.
//
// Pour le logo, le navigateur n'a AUCUN droit d'écriture, ni sur le dépôt
// `cabinet-logos` (policies restrictives v57), ni sur la colonne
// `doctors.logo_path` (trigger v57). Cette route est le seul chemin :
//
//  1. Le dossier de stockage est déduit de la SESSION (le médecin dont l'e-mail
//     est celui du compte connecté), jamais d'une valeur envoyée. Un médecin ne
//     peut donc écrire, remplacer ou supprimer que son propre logo : il n'existe
//     aucun paramètre par lequel désigner celui d'un autre.
//  2. Le contenu du fichier est examiné octet par octet avant d'être accepté
//     (lib/cabinet-logo-server.ts). Personne ne peut contourner cet examen en
//     écrivant directement dans le dépôt.
//  3. Chaque écriture est relue : le fichier est déposé, la colonne mise à jour
//     ET relue, et en cas d'échec le fichier déposé est retiré. Aucune réponse
//     « c'est fait » sans que ce soit fait.
//
// ── FORFAIT ─────────────────────────────────────────────────────────────────
//
// Le logo n'a d'usage que sur les ordonnances, et les ordonnances n'existent
// qu'au Cabinet complet (canAccess(plan, 'prescriptions'), lib/plan.ts). Le
// téléversement est donc refusé ici aux autres forfaits — masquer le bouton
// n'empêche pas d'appeler la route. La SUPPRESSION, elle, reste ouverte à
// tous : un médecin redescendu au forfait Agenda doit pouvoir retirer le
// fichier qu'il a déposé quand il y avait droit.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { LOGO_BUCKET, LOGO_MAX_BYTES, isLogoPathFor, newLogoPath } from '@/lib/cabinet-logo'
import { checkLogoImage } from '@/lib/cabinet-logo-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MIGRATION_ABSENTE = 'Le logo du cabinet n\'est pas encore activé sur le serveur (migration v57). Réessayez plus tard.'
const REFUS_FORFAIT = 'Le logo figure sur les ordonnances, réservées au forfait Cabinet complet.'

type Admin = ReturnType<typeof createAdminClient>

/** Médecin connecté. `null` pour une secrétaire ou un compte patient : le logo
 *  engage le cabinet, seul le praticien le choisit. */
async function medecinConnecte() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const { data: doctor, error } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).maybeSingle()
  if (error) {
    console.error('[Logo cabinet] fiche médecin illisible :', error.message)
    return { error: NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
  }
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }
  return { supabase, doctor: doctor as { id: string; plan: string | null } }
}

/** Colonne inexistante — 42703 en lecture (erreur PostgreSQL), PGRST204 en
 *  écriture (PostgREST ne trouve pas la colonne dans son cache de schéma) — ou
 *  dépôt de fichiers inexistant. Dans tous les cas, la migration v57 n'a pas
 *  été passée : le dire, plutôt qu'« erreur serveur ». */
function migrationManquante(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42703' || err.code === 'PGRST204' || /bucket not found/i.test(err.message ?? '')
}

function publicUrl(admin: Admin, path: string): string {
  return admin.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Retire du dossier du médecin tous les fichiers sauf `garder`, et sauf celui
 * que la colonne désigne À CET INSTANT (relu juste avant) : deux envois
 * concurrents ne peuvent pas effacer le logo que l'autre vient d'enregistrer.
 * Le dossier entier est balayé, pas seulement l'ancien fichier : un envoi
 * interrompu par le passé est ainsi rattrapé au suivant.
 *
 * Renvoie false si un fichier n'a pas pu être effacé. `remove` ne renvoie pas
 * d'erreur pour un fichier qu'il n'a pas trouvé ou pas eu le droit d'effacer :
 * on compare donc le nombre de fichiers effectivement supprimés.
 */
async function nettoyerDossier(admin: Admin, doctorId: string, garder: string | null): Promise<boolean> {
  const { data: fiche, error: ficheErr } = await admin
    .from('doctors').select('logo_path').eq('id', doctorId).maybeSingle()
  if (ficheErr) {
    console.error('[Logo cabinet] relecture avant nettoyage impossible :', ficheErr.message)
    return false
  }
  const proteges = new Set([garder, (fiche as { logo_path?: string | null } | null)?.logo_path ?? null])

  const { data: fichiers, error: listeErr } = await admin.storage.from(LOGO_BUCKET).list(doctorId, { limit: 100 })
  if (listeErr) {
    console.error('[Logo cabinet] liste des fichiers impossible :', listeErr.message)
    return false
  }
  const aSupprimer = (fichiers ?? [])
    .map((f) => `${doctorId}/${f.name}`)
    .filter((p) => !proteges.has(p))
  if (aSupprimer.length === 0) return true

  const { data: supprimes, error: removeErr } = await admin.storage.from(LOGO_BUCKET).remove(aSupprimer)
  if (removeErr || (supprimes?.length ?? 0) !== aSupprimer.length) {
    console.error(
      `[Logo cabinet] ${aSupprimer.length - (supprimes?.length ?? 0)} fichier(s) non effacé(s) pour ${doctorId} :`,
      removeErr?.message ?? 'suppression partielle',
    )
    return false
  }
  return true
}

// ── GET : état du logo, pour le composant de Paramètres ─────────────────────
export async function GET() {
  const ctx = await medecinConnecte()
  if ('error' in ctx) return ctx.error
  const { supabase, doctor } = ctx

  const peutTeleverser = canAccess(doctor.plan, 'prescriptions')
  // Lu à part : avant la migration v57, la colonne n'existe pas et la fiche
  // médecin ne doit pas en pâtir.
  const { data, error } = await supabase
    .from('doctors').select('logo_path').eq('id', doctor.id).maybeSingle()
  if (error) {
    if (migrationManquante(error)) {
      return NextResponse.json({ disponible: false, peutTeleverser, logoUrl: null })
    }
    console.error('[Logo cabinet] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Impossible de lire votre logo. Réessayez.' }, { status: 500 })
  }
  const path = (data as { logo_path?: string | null } | null)?.logo_path ?? null
  const logoUrl = isLogoPathFor(doctor.id, path) ? publicUrl(createAdminClient(), path) : null
  return NextResponse.json({ disponible: true, peutTeleverser, logoUrl })
}

// ── POST : téléversement (ou remplacement) ──────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await medecinConnecte()
  if ('error' in ctx) return ctx.error
  const { doctor } = ctx

  if (!canAccess(doctor.plan, 'prescriptions')) {
    return NextResponse.json({ error: REFUS_FORFAIT }, { status: 403 })
  }

  // Refus AVANT de lire le corps : formData() charge tout en mémoire. La marge
  // couvre l'enveloppe multipart autour du fichier.
  const annonce = Number(req.headers.get('content-length') ?? 0)
  if (annonce > LOGO_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'Le logo dépasse 1 Mo. Réduisez sa taille en pixels avant de l\'envoyer.' }, { status: 413 })
  }

  let fichier: FormDataEntryValue | null
  try {
    fichier = (await req.formData()).get('logo')
  } catch {
    return NextResponse.json({ error: 'Envoi illisible. Réessayez.' }, { status: 400 })
  }
  if (!fichier || typeof fichier === 'string') {
    return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 })
  }
  if (fichier.size > LOGO_MAX_BYTES) {
    return NextResponse.json({ error: 'Le logo dépasse 1 Mo. Réduisez sa taille en pixels avant de l\'envoyer.' }, { status: 413 })
  }

  // Le type annoncé (`fichier.type`) et le nom ne sont PAS consultés : seul le
  // contenu décide du format, de l'extension stockée et du Content-Type servi.
  const verdict = checkLogoImage(Buffer.from(await fichier.arrayBuffer()))
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 415 })

  const admin = createAdminClient()
  const path = newLogoPath(doctor.id, verdict.ext)

  // Nom neuf à chaque envoi : `upsert: false` suffit, et l'adresse change —
  // le cache peut donc être immuable sans jamais resservir l'ancien logo.
  const { error: upErr } = await admin.storage.from(LOGO_BUCKET).upload(path, verdict.data, {
    contentType: verdict.contentType,
    upsert: false,
    cacheControl: '31536000',
  })
  if (upErr) {
    if (migrationManquante(upErr)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    console.error('[Logo cabinet] dépôt du fichier impossible :', upErr.message)
    return NextResponse.json({ error: 'Le logo n\'a pas pu être enregistré. Réessayez.' }, { status: 500 })
  }

  // La colonne est RELUE : c'est précisément ce que `handlePhotoUpload` omet.
  const { data: fiche, error: majErr } = await admin
    .from('doctors').update({ logo_path: path }).eq('id', doctor.id)
    .select('logo_path').maybeSingle()
  const enregistre = (fiche as { logo_path?: string | null } | null)?.logo_path === path
  if (majErr || !enregistre) {
    // Le fichier déposé n'est désigné par rien : on le retire, pour ne pas
    // laisser en ligne un logo que le médecin croit ne pas avoir envoyé.
    const { data: retire, error: retraitErr } = await admin.storage.from(LOGO_BUCKET).remove([path])
    if (retraitErr || (retire?.length ?? 0) !== 1) {
      console.error(`[Logo cabinet] fichier orphelin laissé en place : ${path}`, retraitErr?.message ?? '')
    }
    if (migrationManquante(majErr)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    console.error('[Logo cabinet] enregistrement sur la fiche impossible :', majErr?.message ?? 'aucune ligne modifiée')
    return NextResponse.json({ error: 'Le logo n\'a pas pu être enregistré. Réessayez.' }, { status: 500 })
  }

  // L'ancien logo n'est effacé qu'une fois le nouveau enregistré : un échec
  // plus haut laisse le médecin avec son logo précédent, jamais sans rien.
  // Un ancien fichier resté en place n'est désigné par aucune ordonnance ; il
  // sera repris au prochain envoi. Journalisé, sans alarmer le médecin.
  await nettoyerDossier(admin, doctor.id, path)

  return NextResponse.json({ logoUrl: publicUrl(admin, path) })
}

// ── DELETE : retour à une ordonnance sans logo ──────────────────────────────
export async function DELETE() {
  const ctx = await medecinConnecte()
  if ('error' in ctx) return ctx.error
  const { doctor } = ctx
  const admin = createAdminClient()

  // La colonne d'abord : c'est elle qui fait apparaître le logo sur les
  // ordonnances. Le fichier ensuite. Dans l'ordre inverse, un échec entre les
  // deux laisserait des ordonnances pointant vers une image disparue.
  const { data: fiche, error: majErr } = await admin
    .from('doctors').update({ logo_path: null }).eq('id', doctor.id)
    .select('logo_path').maybeSingle()
  if (majErr || !fiche || (fiche as { logo_path?: string | null }).logo_path !== null) {
    if (migrationManquante(majErr)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    console.error('[Logo cabinet] retrait sur la fiche impossible :', majErr?.message ?? 'aucune ligne modifiée')
    return NextResponse.json({ error: 'Le logo n\'a pas pu être retiré. Réessayez.' }, { status: 500 })
  }

  // Ici, le médecin a DEMANDÉ l'effacement : un fichier resté en ligne doit
  // lui être signalé, même si ses ordonnances sont déjà revenues sans logo.
  const nettoye = await nettoyerDossier(admin, doctor.id, null)
  if (!nettoye) {
    return NextResponse.json({
      logoUrl: null,
      avertissement: 'Le logo ne figure plus sur vos ordonnances, mais le fichier n\'a pas pu être effacé du stockage.',
    })
  }
  return NextResponse.json({ logoUrl: null })
}
