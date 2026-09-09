// API devis de l'espace cabinet (SECRÉTAIRE). Deux verbes, pas un de plus :
//   GET  — lire les devis d'un patient        (permission « Afficher les devis »)
//   POST — saisir un versement reçu           (permission « Encaisser sur un devis »)
//
// Ce que la secrétaire ne peut PAS faire est garanti par ce qui n'existe pas
// ici : aucun PATCH, aucun DELETE, aucune écriture sur `quotes`, `quote_items`
// ni `quote_installments`. Créer ou modifier un devis, toucher un prix, changer
// un statut, supprimer un versement ou émettre un avoir n'a donc pas d'adresse
// côté secrétaire — ce n'est pas un bouton caché, c'est une route inexistante.
// Les routes du médecin (/api/quotes/…) ne la dépannent pas non plus : elles
// passent toutes par requireQuoteDoctor(), qui cherche l'e-mail de l'appelant
// dans `doctors` — une secrétaire n'y figure pas et reçoit un 404. Un plan de
// traitement est une décision clinique et commerciale du praticien ; annuler
// une recette est un acte comptable. Encaisser, oui ; défaire, non.
//
// RLS : les tables quote_* (v54) n'ouvrent leurs lignes qu'au médecin
// propriétaire, et la secrétaire n'est pas un médecin. On emprunte donc le
// client admin, comme le font déjà les autres routes /api/cabinet — mais JAMAIS
// avant d'avoir vérifié, dans la même requête, que le patient (GET) ou le devis
// (POST) porte bien le `doctor_id` du cabinet de la secrétaire. Le service_role
// ne connaît aucune frontière : c'est ce `.eq('doctor_id', ctx.doctor.id)` qui
// la redessine, à chaque appel.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { enregistrerVersement } from '@/lib/devis-server'
import { logAccesDossier } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// GET /api/cabinet/quotes?patient_id=… — devis du patient, avec lignes,
// versements et échéancier (le dossier les affiche ensemble, comme chez le médecin).
export async function GET(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  // getStaffContext a déjà retiré cette permission si le forfait ne couvre pas
  // le dossier de soins, ou si le médecin a activé le mode confidentiel.
  if (!ctx.permissions.quotes_view) {
    return NextResponse.json({ error: 'Le médecin ne vous a pas donné accès aux devis.' }, { status: 403 })
  }

  const patientId = req.nextUrl.searchParams.get('patient_id')
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const admin = createAdminClient()
  const { data: patient } = await admin.from('patients')
    .select('id').eq('id', patientId).eq('doctor_id', ctx.doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const { data, error } = await admin
    .from('quotes')
    .select('*, items:quote_items(*), payments:quote_payments(*), installments:quote_installments(*)')
    .eq('doctor_id', ctx.doctor.id)
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })

  // Un devis nomme les actes et les dents : sa consultation par la secrétaire
  // se journalise, comme l'ouverture d'un dossier (v44). Le journal ne sert pas
  // à interdire — elle en a le droit — mais à pouvoir démontrer plus tard qui a
  // regardé quoi.
  await logAccesDossier({
    doctorId: ctx.doctor.id, actorRole: 'secretaire', actorEmail: ctx.email,
    action: 'devis_consulte', patientId: patient.id,
    extra: { devis: (data ?? []).length },
  })

  return NextResponse.json({ quotes: data ?? [], permissions: ctx.permissions })
}

// POST — enregistrer un versement REÇU sur un devis du cabinet.
// Corps : { quote_id, amount, payment_method?, paid_at?, note? }
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.quotes_payment) {
    return NextResponse.json({ error: 'Le médecin ne vous a pas donné la permission d\'encaisser sur un devis.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const quoteId = body.quote_id ? String(body.quote_id) : ''
  if (!quoteId) return NextResponse.json({ error: 'Devis manquant' }, { status: 400 })

  const admin = createAdminClient()
  // Appartenance au cabinet AVANT toute écriture. Un devis d'un autre cabinet
  // répond « introuvable » et non « interdit » : un 403 confirmerait au curieux
  // que l'identifiant essayé existe bien quelque part.
  const { data: quote } = await admin
    .from('quotes').select('id, patient_id, status')
    .eq('id', quoteId).eq('doctor_id', ctx.doctor.id).maybeSingle()
  if (!quote) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

  // Mêmes règles d'argent que pour le médecin — montant, mode de règlement,
  // date non future, refus du trop-perçu, numéro de facture posé par le trigger
  // v54, passage automatique en « terminé » quand le devis est soldé. Elles ne
  // sont écrites qu'une fois (lib/devis-server.ts) : un garde-fou corrigé un
  // jour ne doit pas rester ouvert du côté de celle dont on se méfie le plus.
  const res = await enregistrerVersement(admin, quote, ctx.doctor.id, body)
  if ('error' in res) return res.error

  // Le versement porte le `doctor_id` du cabinet, jamais l'identité de la
  // personne qui l'a saisi : sans cette ligne de journal, un encaissement par
  // la secrétaire serait indiscernable d'un encaissement par le médecin.
  await logAccesDossier({
    doctorId: ctx.doctor.id, actorRole: 'secretaire', actorEmail: ctx.email,
    action: 'devis_versement_saisi', patientId: quote.patient_id,
    extra: { montant: Number(body.amount), mode: body.payment_method ?? null },
  })

  return NextResponse.json(res.payment, { status: 201 })
}
