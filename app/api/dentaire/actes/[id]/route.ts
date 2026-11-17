// Un acte du registre — PATCH (modifier, changer de statut) et DELETE.
import { NextRequest, NextResponse } from 'next/server'
import { requireDentiste, estUuid } from '@/lib/dentaire-server'
import { verifierSaisie } from '@/lib/actes-patient'
import { COLONNES_ACTE, lireActe, registreAbsent, suivreActeDansDevis } from '@/lib/actes-patient-serveur'

export const dynamic = 'force-dynamic'

const INTROUVABLE = () => NextResponse.json({ error: 'Acte introuvable' }, { status: 404 })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx
  if (!estUuid(params.id)) return INTROUVABLE()

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const v = verifierSaisie(body, true)
  if (!v.ok) return NextResponse.json({ error: v.erreur }, { status: 400 })
  if (Object.keys(v.valeur).length === 0) return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })

  const { data: avant, error: errAvant } = await supabase
    .from('actes_patient').select(COLONNES_ACTE).eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (errAvant && registreAbsent(errAvant.code)) return INTROUVABLE()
  if (!avant) return INTROUVABLE()
  const ancien = lireActe(avant as Record<string, unknown>)

  // Une feuille de soins remise au patient ne change plus : ce qu'elle atteste
  // (dents, acte, montant, date) ne doit pas changer sous elle. Le statut et
  // la remarque restent libres.
  if (ancien.care_sheet_id) {
    const figes = ['libelle', 'code', 'prix', 'dents', 'date_acte'] as const
    if (figes.some((k) => k in v.valeur && JSON.stringify(v.valeur[k]) !== JSON.stringify(ancien[k]))) {
      return NextResponse.json({
        error: 'Cet acte figure sur une feuille de soins : supprimez d’abord la feuille pour le modifier.',
      }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('actes_patient')
    .update({ ...v.valeur, updated_at: new Date().toISOString() })
    .eq('id', ancien.id).eq('doctor_id', doctor.id)
    .select(COLONNES_ACTE).maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'L’acte n’a pas pu être modifié.' }, { status: 500 })
  const acte = lireActe(data as Record<string, unknown>)

  // L'acte vient du plan de traitement : la ligne du devis suit son statut.
  if (acte.statut !== ancien.statut) await suivreActeDansDevis(supabase, doctor.id, acte)

  return NextResponse.json({ acte })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx
  if (!estUuid(params.id)) return INTROUVABLE()

  const { data: acte } = await supabase
    .from('actes_patient').select('id, quote_item_id, care_sheet_id')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!acte) return INTROUVABLE()

  // Supprimé ici, il reviendrait à la prochaine ouverture : c'est la ligne du
  // devis qui le fait exister.
  if (acte.quote_item_id) {
    return NextResponse.json({
      error: 'Cet acte vient du plan de traitement. Passez-le en « Annulé », ou retirez la ligne du devis.',
    }, { status: 409 })
  }
  if (acte.care_sheet_id) {
    return NextResponse.json({
      error: 'Cet acte figure sur une feuille de soins : supprimez d’abord la feuille.',
    }, { status: 409 })
  }

  const { error } = await supabase.from('actes_patient').delete().eq('id', acte.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
