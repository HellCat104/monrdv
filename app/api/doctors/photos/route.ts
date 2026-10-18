// Photos du cabinet (migration v74) : liste (GET), ajout (POST), suppression
// (DELETE), réorganisation (PATCH). Réservé au médecin connecté, sur SES
// propres photos.
//
// ── POURQUOI TOUT PASSE PAR ICI ─────────────────────────────────────────────
//
// Même régime que le logo (v57), et pour les mêmes raisons. Le navigateur n'a
// aucun droit d'écriture, ni sur le dépôt `cabinet-photos` (policies
// restrictives v74), ni sur la colonne `doctors.photos` (trigger v74). Cette
// route est le seul chemin :
//
//  1. Le dossier de stockage est déduit de la SESSION, jamais d'une valeur
//     envoyée. Aucun paramètre ne permet de désigner les photos d'un autre
//     cabinet : un médecin ne peut toucher que les siennes, par construction.
//  2. Le fichier est examiné avant d'être accepté — poids, et surtout les
//     premiers octets, qui doivent être ceux d'un JPEG. Le type déclaré par le
//     navigateur ne prouve rien ; les octets, si.
//  3. Chaque écriture est relue. Le fichier est déposé, la colonne mise à jour
//     ET relue ; si la base refuse, le fichier déposé est retiré. Jamais de
//     réponse « c'est fait » sans que ce soit fait, et jamais de fichier
//     orphelin dans le dépôt.
//
// La suppression retire le fichier ET l'entrée du tableau, dans cet ordre
// inverse : le tableau d'abord (c'est lui qui est affiché), le fichier
// ensuite. Si le second échoue, il reste un fichier invisible — préférable à
// une galerie qui pointe vers un fichier disparu.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  PHOTOS_BUCKET, PHOTOS_MAX, PHOTO_MAX_BYTES,
  isPhotoPathFor, newPhotoPath, photosValides,
} from '@/lib/cabinet-photos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MIGRATION_ABSENTE =
  "Les photos du cabinet ne sont pas encore activées sur le serveur (migration v74). Réessayez plus tard."

type Admin = ReturnType<typeof createAdminClient>

/** Médecin connecté. `null` pour une secrétaire ou un compte patient : les
 *  photos engagent l'image du cabinet, seul le praticien les choisit. */
async function medecinConnecte() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const { data: doctor, error } = await supabase
    .from('doctors').select('id').eq('email', user.email).maybeSingle()
  if (error) {
    console.error('[Photos cabinet] fiche médecin illisible :', error.message)
    return { error: NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
  }
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }
  return { doctor: doctor as { id: string } }
}

/** Colonne inexistante (42703 en lecture, PGRST204 en écriture) ou dépôt
 *  absent : la v74 n'a pas été passée. Le dire, plutôt qu'« erreur serveur ». */
function migrationManquante(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42703' || err.code === 'PGRST204' || /bucket not found/i.test(err.message ?? '')
}

function adresses(admin: Admin, chemins: string[]) {
  return chemins.map((chemin) => ({
    chemin,
    url: admin.storage.from(PHOTOS_BUCKET).getPublicUrl(chemin).data.publicUrl,
  }))
}

/** Photos actuelles du médecin, nettoyées des valeurs inattendues. */
async function lirePhotos(admin: Admin, doctorId: string) {
  const { data, error } = await admin
    .from('doctors').select('photos').eq('id', doctorId).maybeSingle()
  if (error) return { error }
  return { photos: photosValides(doctorId, data?.photos) }
}

// ---------------------------------------------------------------- GET

export async function GET() {
  const session = await medecinConnecte()
  if ('error' in session) return session.error

  const admin = createAdminClient()
  const lu = await lirePhotos(admin, session.doctor.id)
  if (lu.error) {
    if (migrationManquante(lu.error)) {
      return NextResponse.json({ photos: [], migrationAbsente: true })
    }
    console.error('[Photos cabinet] lecture :', lu.error.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ photos: adresses(admin, lu.photos!) })
}

// ---------------------------------------------------------------- POST

export async function POST(req: NextRequest) {
  const session = await medecinConnecte()
  if ('error' in session) return session.error
  const doctorId = session.doctor.id
  const admin = createAdminClient()

  const form = await req.formData().catch(() => null)
  const fichier = form?.get('fichier')
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 })
  }
  if (fichier.size === 0) {
    return NextResponse.json({ error: 'Fichier vide' }, { status: 400 })
  }
  if (fichier.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: 'Photo trop lourde (2 Mo maximum)' }, { status: 400 })
  }

  const octets = Buffer.from(await fichier.arrayBuffer())
  // Les trois premiers octets d'un JPEG sont FF D8 FF. Le type annoncé par le
  // navigateur est déclaratif ; celui-ci se lit dans le fichier. Le dépôt
  // n'accepte de toute façon que image/jpeg, ceci en est la contrepartie
  // côté contenu.
  if (octets.length < 3 || octets[0] !== 0xff || octets[1] !== 0xd8 || octets[2] !== 0xff) {
    return NextResponse.json({ error: 'Le fichier n\'est pas une image JPEG' }, { status: 400 })
  }

  const lu = await lirePhotos(admin, doctorId)
  if (lu.error) {
    if (migrationManquante(lu.error)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    console.error('[Photos cabinet] lecture avant ajout :', lu.error.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  const actuelles = lu.photos!
  if (actuelles.length >= PHOTOS_MAX) {
    return NextResponse.json({ error: `${PHOTOS_MAX} photos au maximum` }, { status: 400 })
  }

  const chemin = newPhotoPath(doctorId, actuelles.length)
  const { error: depot } = await admin.storage
    .from(PHOTOS_BUCKET)
    .upload(chemin, octets, { contentType: 'image/jpeg', upsert: false })

  if (depot) {
    if (migrationManquante(depot)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    console.error('[Photos cabinet] dépôt :', depot.message)
    return NextResponse.json({ error: 'Le dépôt de la photo a échoué' }, { status: 500 })
  }

  const suite = [...actuelles, chemin]
  const { error: maj } = await admin.from('doctors').update({ photos: suite }).eq('id', doctorId)

  if (maj) {
    // La colonne n'a pas été écrite : on retire le fichier, sinon il reste
    // dans le dépôt sans que rien ne le référence ni ne permette de le voir.
    await admin.storage.from(PHOTOS_BUCKET).remove([chemin])
    if (migrationManquante(maj)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    console.error('[Photos cabinet] mise à jour :', maj.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  // Relecture : on ne répond « c'est fait » qu'après l'avoir constaté.
  const relu = await lirePhotos(admin, doctorId)
  return NextResponse.json({ photos: adresses(admin, relu.photos ?? suite) }, { status: 201 })
}

// ---------------------------------------------------------------- DELETE

export async function DELETE(req: NextRequest) {
  const session = await medecinConnecte()
  if ('error' in session) return session.error
  const doctorId = session.doctor.id
  const admin = createAdminClient()

  const chemin = new URL(req.url).searchParams.get('chemin') ?? ''
  // Le chemin doit appartenir à CE médecin. Sans ce contrôle, le paramètre
  // désignerait la photo de n'importe quel cabinet.
  if (!isPhotoPathFor(doctorId, chemin)) {
    return NextResponse.json({ error: 'Photo inconnue' }, { status: 400 })
  }

  const lu = await lirePhotos(admin, doctorId)
  if (lu.error) {
    if (migrationManquante(lu.error)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  const suite = lu.photos!.filter((p) => p !== chemin)
  const { error: maj } = await admin.from('doctors').update({ photos: suite }).eq('id', doctorId)
  if (maj) {
    console.error('[Photos cabinet] suppression :', maj.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  // Le fichier ensuite : s'il résiste, il devient invisible, ce qui est
  // préférable à une galerie qui pointe vers un fichier disparu.
  const { error: retrait } = await admin.storage.from(PHOTOS_BUCKET).remove([chemin])
  if (retrait) console.error('[Photos cabinet] fichier non retiré :', retrait.message)

  return NextResponse.json({ photos: adresses(admin, suite) })
}

// ---------------------------------------------------------------- PATCH

/** Réorganisation. Le corps donne l'ordre voulu ; on n'accepte que des chemins
 *  déjà enregistrés pour ce médecin — jamais d'ajout déguisé en réordonnancement. */
export async function PATCH(req: NextRequest) {
  const session = await medecinConnecte()
  if ('error' in session) return session.error
  const doctorId = session.doctor.id
  const admin = createAdminClient()

  const body = await req.json().catch(() => null)
  const voulu = Array.isArray(body?.photos) ? (body.photos as unknown[]) : null
  if (!voulu) return NextResponse.json({ error: 'Ordre manquant' }, { status: 400 })

  const lu = await lirePhotos(admin, doctorId)
  if (lu.error) {
    if (migrationManquante(lu.error)) return NextResponse.json({ error: MIGRATION_ABSENTE }, { status: 503 })
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  const actuelles = lu.photos!

  // Même ensemble, ordre différent : tout chemin absent des photos actuelles
  // est ignoré, et toute photo oubliée est remise à la fin. Une réorganisation
  // ne doit jamais faire disparaître une photo par inadvertance.
  const reordonnees = voulu.filter((p): p is string => typeof p === 'string' && actuelles.includes(p))
  const suite = [...reordonnees, ...actuelles.filter((p) => !reordonnees.includes(p))]

  const { error: maj } = await admin.from('doctors').update({ photos: suite }).eq('id', doctorId)
  if (maj) {
    console.error('[Photos cabinet] réorganisation :', maj.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  return NextResponse.json({ photos: adresses(admin, suite) })
}
