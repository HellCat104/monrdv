// API devis — modification d'une ligne (prix, acte réalisé…) et suppression.
import { NextRequest, NextResponse } from 'next/server'
import { requireQuoteDoctor, loadOwnedQuote, quoteNotFound } from '@/lib/devis-server'
import { isValidTooth } from '@/lib/dental'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  // Le rendez-vous auquel cette ligne était rattachée AVANT la modification :
  // c'est lui qu'il faudra peut-être libérer (voir la fin de la fonction).
  const { data: avant } = await supabase
    .from('quote_items').select('appointment_id')
    .eq('id', params.itemId).eq('quote_id', quote.id).eq('doctor_id', doctor.id).maybeSingle()
  const ancienRdv = (avant?.appointment_id as string | null) ?? null

  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 160)
    if (!label) return NextResponse.json({ error: 'Libellé manquant' }, { status: 400 })
    updates.label = label
  }
  if (body.unit_price !== undefined) {
    const price = Number(body.unit_price)
    if (!Number.isFinite(price) || price < 0 || price > 1000000) {
      return NextResponse.json({ error: 'Prix invalide' }, { status: 400 })
    }
    updates.unit_price = price
  }
  if (body.quantity !== undefined) {
    const q = Number(body.quantity)
    if (!Number.isInteger(q) || q < 1 || q > 99) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
    }
    updates.quantity = q
  }
  if (body.tooth !== undefined) {
    const raw = body.tooth === null ? '' : String(body.tooth).trim()
    if (raw && !isValidTooth(raw)) {
      return NextResponse.json({ error: 'Numéro de dent invalide (notation FDI, ex. 16)' }, { status: 400 })
    }
    updates.tooth = raw || null
  }

  // Séance prévue du plan. Planification pure : elle n'implique aucun
  // rendez-vous, et n'en crée aucun.
  if (body.session_no !== undefined) {
    if (body.session_no === null || body.session_no === '') {
      updates.session_no = null
    } else {
      const n = Number(body.session_no)
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return NextResponse.json({ error: 'Numéro de séance invalide (1 à 20)' }, { status: 400 })
      }
      updates.session_no = n
    }
  }

  // Acte réalisé : on note QUAND, et lors de quel rendez-vous quand
  // l'information est fournie. C'est ce qui permet, plus tard, de savoir quel
  // acte a été posé à quelle séance — le devis seul ne le dirait pas.
  if (body.done !== undefined) {
    const done = body.done === true
    updates.done = done
    updates.done_at = done ? new Date().toISOString() : null
    if (!done) updates.appointment_id = null
  }
  if (body.appointment_id !== undefined) {
    if (body.appointment_id === null) {
      updates.appointment_id = null
    } else {
      // Le RDV doit appartenir au médecin ET au même patient : sans ce
      // contrôle, une ligne de devis pointerait vers la séance d'un autre.
      const { data: apt } = await supabase
        .from('appointments').select('id, amount_paid')
        .eq('id', String(body.appointment_id))
        .eq('doctor_id', doctor.id)
        .eq('patient_id', quote.patient_id)
        .maybeSingle()
      if (!apt) return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 })
      // Ce RDV exécute des actes du devis : son argent se saisit désormais sur
      // le devis, jamais deux fois. On le marque donc « réglé via le devis »
      // — sauf s'il porte déjà un encaissement, auquel cas c'est au médecin de
      // trancher : soit il annule ce paiement, soit il ne rattache pas la
      // séance. Décider à sa place effacerait une recette déjà comptabilisée.
      if (apt.amount_paid != null) {
        return NextResponse.json({
          error: 'Ce rendez-vous porte déjà un encaissement propre. Annulez-le d\'abord, sinon la somme serait comptée deux fois.',
        }, { status: 409 })
      }
      updates.appointment_id = apt.id
      await supabase.from('appointments')
        .update({ quote_id: quote.id })
        .eq('id', apt.id).eq('doctor_id', doctor.id)
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('quote_items').update(updates)
    .eq('id', params.itemId).eq('quote_id', quote.id).eq('doctor_id', doctor.id)
    .select('*').maybeSingle()

  if (error) {
    // Colonne absente : la v67 n'est pas passée. Le message dit quoi faire,
    // au lieu d'un « modification impossible » que personne ne peut corriger.
    if (error.code === '42703' || error.code === 'PGRST204') {
      return NextResponse.json({
        error: 'Les séances du plan de traitement ne sont pas encore activées sur votre base (migration v67).',
      }, { status: 503 })
    }
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 })

  await supabase.from('quotes').update({ updated_at: new Date().toISOString() })
    .eq('id', quote.id).eq('doctor_id', doctor.id)

  // LIBÉRATION DU RENDEZ-VOUS
  //
  // Rattacher un acte pose `quote_id` sur le rendez-vous, ce qui lui interdit
  // tout encaissement propre (trigger v54 : la même somme ne peut pas être
  // comptée deux fois). Mais détacher le dernier acte ne retirait PAS ce
  // `quote_id` : le rendez-vous restait « réglé via le devis » pour toujours,
  // et le praticien se retrouvait avec une séance qu'il ne pouvait plus
  // encaisser, sans comprendre pourquoi. On le libère donc dès qu'aucune
  // ligne du devis ne pointe plus vers lui.
  const nouveauRdv = (data.appointment_id as string | null) ?? null
  if (ancienRdv && ancienRdv !== nouveauRdv) {
    const { count } = await supabase
      .from('quote_items')
      .select('id', { count: 'exact', head: true })
      .eq('quote_id', quote.id).eq('doctor_id', doctor.id).eq('appointment_id', ancienRdv)
    if ((count ?? 0) === 0) {
      const { error: errLiberation } = await supabase
        .from('appointments').update({ quote_id: null })
        .eq('id', ancienRdv).eq('doctor_id', doctor.id).eq('quote_id', quote.id)
      // Un échec ici ne doit pas annuler la modification de l'acte, déjà
      // écrite : on le signale, le praticien garde un RDV verrouillé.
      if (errLiberation) console.error('[Devis] rendez-vous non libéré :', errLiberation.message)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const auth = await requireQuoteDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const quote = await loadOwnedQuote(auth.ctx, params.id)
  if (!quote) return quoteNotFound()

  // Retirer une ligne baisse le total du devis. Si le patient a déjà versé plus
  // que le nouveau total, le reste dû deviendrait négatif — on refuse, et le
  // médecin corrige d'abord ce qu'il faut. (Le devis reste un document remis au
  // patient : on ne le vide pas discrètement sous ses versements.)
  const [{ data: item }, { data: items }, { data: payments }] = await Promise.all([
    supabase.from('quote_items').select('*')
      .eq('id', params.itemId).eq('quote_id', quote.id).maybeSingle(),
    supabase.from('quote_items').select('unit_price, quantity').eq('quote_id', quote.id),
    supabase.from('quote_payments').select('amount').eq('quote_id', quote.id),
  ])
  if (!item) return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 })

  const totalApres = (items ?? []).reduce(
    (s: number, i: { unit_price: number; quantity: number }) => s + Number(i.unit_price) * Number(i.quantity), 0,
  ) - Number(item.unit_price) * Number(item.quantity)
  const encaisse = (payments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0)
  if (encaisse > Math.round(totalApres * 100) / 100) {
    return NextResponse.json({
      error: `Impossible : le patient a déjà versé ${encaisse} DH, plus que le devis ne vaudrait sans cette ligne.`,
    }, { status: 409 })
  }

  const { error } = await supabase
    .from('quote_items').delete()
    .eq('id', params.itemId).eq('quote_id', quote.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })

  await supabase.from('quotes').update({ updated_at: new Date().toISOString() })
    .eq('id', quote.id).eq('doctor_id', doctor.id)

  return NextResponse.json({ success: true })
}
