// Les tarifs du cabinet dentaire — ce qu'il change au catalogue des actes.
//
//   GET    → ses réglages + la mémoire de ses derniers prix pratiqués
//   PUT    → fixer un prix, masquer / rétablir un acte, créer ou renommer un
//            acte à lui
//   DELETE → retirer un acte à lui, ou rendre à un acte du catalogue ses
//            valeurs par défaut
//
// Le catalogue lui-même (NGAP) est dans le code : lib/actes-dentaires.ts.
import { NextRequest, NextResponse } from 'next/server'
import { requireDentiste, estUuid } from '@/lib/dentaire-server'
import { ACTES_DENTAIRES, cleActe } from '@/lib/actes-dentaires'
import { derniersPrix, type TarifCabinet } from '@/lib/actes-patient'
import { registreAbsent } from '@/lib/actes-patient-serveur'

export const dynamic = 'force-dynamic'

const NON_ACTIVE = 'Les tarifs ne sont pas encore activés sur votre base (migration v101).'
const CLES_OFFICIELLES = new Set(ACTES_DENTAIRES.map(cleActe))
/** La mémoire des prix remonte sur ces actes-là : plusieurs mois d'un cabinet
 *  actif. Au-delà, un prix qu'on n'a pas pratiqué depuis est justement celui
 *  qui a pu changer. */
const MEMOIRE_ACTES = 1500

function lireTarif(r: Record<string, unknown>): TarifCabinet {
  return {
    id: String(r.id),
    cle: (r.cle as string | null) ?? null,
    libelle: String(r.libelle ?? ''),
    prix: r.prix == null ? null : Number(r.prix),
    actif: r.actif !== false,
  }
}

export async function GET() {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const [tarifs, actes] = await Promise.all([
    supabase.from('actes_tarifs').select('id, cle, libelle, prix, actif').eq('doctor_id', doctor.id),
    supabase.from('actes_patient').select('code, libelle, prix, statut')
      .eq('doctor_id', doctor.id)
      .order('date_acte', { ascending: false }).order('created_at', { ascending: false })
      .limit(MEMOIRE_ACTES),
  ])
  if (tarifs.error) {
    if (registreAbsent(tarifs.error.code)) return NextResponse.json({ tarifs: [], derniers: {}, active: false })
    return NextResponse.json({ error: 'Les tarifs n’ont pas pu être lus.' }, { status: 500 })
  }
  return NextResponse.json({
    tarifs: (tarifs.data ?? []).map((r) => lireTarif(r as Record<string, unknown>)),
    derniers: actes.error ? {} : derniersPrix((actes.data ?? []).map((a) => ({
      code: a.code as string | null, libelle: String(a.libelle ?? ''), prix: Number(a.prix ?? 0), statut: a.statut as 'fini',
    }))),
    active: true,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

  const maj: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.prix !== undefined) {
    const brut = String(body.prix ?? '').replace(',', '.').trim()
    if (brut === '') maj.prix = null
    else {
      const prix = Number(brut)
      if (!Number.isFinite(prix) || prix < 0 || prix > 1000000) return NextResponse.json({ error: 'Prix invalide.' }, { status: 400 })
      maj.prix = Math.round(prix * 100) / 100
    }
  }
  if (body.actif !== undefined) maj.actif = body.actif !== false
  if (body.libelle !== undefined) {
    const libelle = String(body.libelle ?? '').replace(/\s+/g, ' ').trim()
    if (!libelle || libelle.length > 200) return NextResponse.json({ error: 'Libellé invalide (1 à 200 caractères).' }, { status: 400 })
    maj.libelle = libelle
  }

  // 1. Un acte du cabinet déjà créé : on le modifie par son identifiant.
  if (estUuid(body.id)) {
    const { data, error } = await supabase
      .from('actes_tarifs').update(maj).eq('id', body.id).eq('doctor_id', doctor.id)
      .select('id, cle, libelle, prix, actif').maybeSingle()
    if (error) return NextResponse.json({ error: registreAbsent(error.code) ? NON_ACTIVE : 'Enregistrement impossible.' }, { status: registreAbsent(error.code) ? 503 : 500 })
    if (!data) return NextResponse.json({ error: 'Acte introuvable' }, { status: 404 })
    return NextResponse.json({ tarif: lireTarif(data as Record<string, unknown>) })
  }

  // 2. Un acte du catalogue officiel : une ligne par acte et par cabinet.
  if (typeof body.cle === 'string') {
    const cle = body.cle
    if (!CLES_OFFICIELLES.has(cle)) return NextResponse.json({ error: 'Acte inconnu du catalogue.' }, { status: 400 })
    const officiel = ACTES_DENTAIRES.find((a) => cleActe(a) === cle)!
    const { data: existant, error: errLu } = await supabase
      .from('actes_tarifs').select('id').eq('doctor_id', doctor.id).eq('cle', cle).maybeSingle()
    if (errLu && registreAbsent(errLu.code)) return NextResponse.json({ error: NON_ACTIVE }, { status: 503 })
    const requete = existant
      ? supabase.from('actes_tarifs').update(maj).eq('id', existant.id).eq('doctor_id', doctor.id)
      : supabase.from('actes_tarifs').insert({ doctor_id: doctor.id, cle, libelle: officiel.libelle, ...maj })
    const { data, error } = await requete.select('id, cle, libelle, prix, actif').maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500 })
    return NextResponse.json({ tarif: lireTarif(data as Record<string, unknown>) })
  }

  // 3. Un nouvel acte du cabinet.
  if (!maj.libelle) return NextResponse.json({ error: 'Donnez un nom à l’acte.' }, { status: 400 })
  const { data, error } = await supabase
    .from('actes_tarifs').insert({ doctor_id: doctor.id, cle: null, ...maj })
    .select('id, cle, libelle, prix, actif').maybeSingle()
  if (error || !data) {
    const absent = registreAbsent(error?.code)
    return NextResponse.json({ error: absent ? NON_ACTIVE : 'Enregistrement impossible.' }, { status: absent ? 503 : 500 })
  }
  return NextResponse.json({ tarif: lireTarif(data as Record<string, unknown>) })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx
  const id = req.nextUrl.searchParams.get('id')
  if (!estUuid(id)) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const { error } = await supabase.from('actes_tarifs').delete().eq('id', id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
