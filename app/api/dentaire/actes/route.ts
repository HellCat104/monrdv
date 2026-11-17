// Le registre des actes d'un patient — GET (la liste), POST (ajouter),
// PATCH (porter des actes sur une feuille de soins).
//
// Réservé au dentiste titulaire (lib/dentaire-server.ts). La secrétaire n'y
// accède pas : un acte coté est une donnée clinique.
import { NextRequest, NextResponse } from 'next/server'
import { requireDentiste, patientDuCabinet, PATIENT_INTROUVABLE, estUuid } from '@/lib/dentaire-server'
import { acteParCode } from '@/lib/actes-dentaires'
import { repartirDents, verifierSaisie, type SaisieActe } from '@/lib/actes-patient'
import { COLONNES_ACTE, lireActe, registreAbsent, synchroniserDevis } from '@/lib/actes-patient-serveur'

export const dynamic = 'force-dynamic'

const MAX_ACTES = 500
const NON_ACTIVE = 'La liste des actes n’est pas encore activée sur votre base (migration v101).'

export async function GET(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const patientId = await patientDuCabinet(auth.ctx, req.nextUrl.searchParams.get('patient_id'))
  if (!patientId) return PATIENT_INTROUVABLE()

  // Le plan de traitement accepté entre dans la liste AVANT la lecture : le
  // praticien voit ses actes « à faire » dès qu'il ouvre le dossier.
  await synchroniserDevis(supabase, doctor.id, patientId)

  const { data, error } = await supabase
    .from('actes_patient').select(COLONNES_ACTE)
    .eq('doctor_id', doctor.id).eq('patient_id', patientId)
    .order('date_acte', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ACTES)
  if (error) {
    if (registreAbsent(error.code)) return NextResponse.json({ actes: [], active: false })
    console.error('[Actes] lecture :', error.message)
    return NextResponse.json({ error: 'La liste des actes n’a pas pu être lue.' }, { status: 500 })
  }
  return NextResponse.json({ actes: (data ?? []).map((r) => lireActe(r as Record<string, unknown>)), active: true })
}

export async function POST(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

  const patientId = await patientDuCabinet(auth.ctx, body.patient_id)
  if (!patientId) return PATIENT_INTROUVABLE()

  const v = verifierSaisie(body)
  if (!v.ok) return NextResponse.json({ error: v.erreur }, { status: 400 })
  const saisie = v.valeur as SaisieActe

  // La séance : elle doit être un rendez-vous de CE patient chez CE médecin.
  let appointmentId: string | null = null
  if (estUuid(body.appointment_id)) {
    const { data: rdv } = await supabase
      .from('appointments').select('id')
      .eq('id', body.appointment_id).eq('doctor_id', doctor.id).eq('patient_id', patientId).maybeSingle()
    appointmentId = rdv?.id ?? null
  }

  // Un acte qui se compte « par dent » (obturation, extraction…) devient un
  // acte par dent touchée ; un acte de bloc reste entier. Pour un acte du
  // catalogue officiel, c'est la NGAP qui le dit ; pour un acte du cabinet,
  // l'écran l'a décidé (`par_dent`).
  const officiel = acteParCode(saisie.code)
  const exigence = officiel ? officiel.dent : (body.par_dent === false ? 'bloc' : 'une')
  const groupes = repartirDents(exigence, saisie.dents)

  const lignes = groupes.map((dents) => ({
    doctor_id: doctor.id,
    patient_id: patientId,
    appointment_id: appointmentId,
    date_acte: saisie.date_acte,
    dents,
    faces: saisie.faces ?? [],
    libelle: saisie.libelle,
    code: saisie.code ?? null,
    prix: saisie.prix,
    remarque: saisie.remarque ?? null,
    statut: saisie.statut,
  }))

  const { data, error } = await supabase.from('actes_patient').insert(lignes).select(COLONNES_ACTE)
  if (error) {
    if (registreAbsent(error.code)) return NextResponse.json({ error: NON_ACTIVE }, { status: 503 })
    console.error('[Actes] création :', error.message)
    return NextResponse.json({ error: 'L’acte n’a pas pu être enregistré.' }, { status: 500 })
  }
  return NextResponse.json({ actes: (data ?? []).map((r) => lireActe(r as Record<string, unknown>)) })
}

/** Porter des actes sur une feuille de soins qui vient d'être établie. La
 *  feuille doit être celle de ce patient, chez ce médecin. */
export async function PATCH(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter(estUuid) : []
  const feuille = body?.care_sheet_id
  if (ids.length === 0 || ids.length > 100 || !estUuid(feuille)) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const { data: f } = await supabase
    .from('care_sheets').select('id, patient_id').eq('id', feuille).eq('doctor_id', doctor.id).maybeSingle()
  if (!f) return NextResponse.json({ error: 'Feuille de soins introuvable' }, { status: 404 })

  const { error } = await supabase
    .from('actes_patient')
    .update({ care_sheet_id: f.id, updated_at: new Date().toISOString() })
    .eq('doctor_id', doctor.id).eq('patient_id', f.patient_id).in('id', ids)
  if (error) {
    if (registreAbsent(error.code)) return NextResponse.json({ error: NON_ACTIVE }, { status: 503 })
    return NextResponse.json({ error: 'Les actes n’ont pas pu être rattachés à la feuille.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
