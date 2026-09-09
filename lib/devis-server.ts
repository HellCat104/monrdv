// Contrôle d'accès des routes /api/quotes — un seul endroit, appliqué partout.
//
// Trois vérifications qui doivent TOUTES tomber avant la moindre écriture :
//   1. une session ouverte,
//   2. un médecin qui existe et dont le forfait couvre la fonctionnalité,
//   3. un devis qui lui appartient VRAIMENT.
//
// Le point 3 mérite d'être fait ici plutôt que route par route : un devis porte
// le nom d'un patient, la dent traitée et le prix. Une route qui oublierait le
// `.eq('doctor_id', …)` laisserait un cabinet lire le plan de traitement d'un
// autre en devinant un identifiant. La RLS (v54) constitue le second rempart,
// mais on ne s'appuie jamais sur elle seule : les routes qui passeraient un
// jour par le client admin (service_role) la court-circuitent.
//
// Forfait : le devis fait partie du dossier de soins (dent, acte, plan de
// traitement) — c'est donc `records` qui commande, comme pour les notes de
// consultation. L'encaissement d'un versement exige en plus `payments`.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess, type PlanFeatures } from '@/lib/plan'
import { quoteTotal, quotePaid, round2 } from '@/lib/devis'

export interface QuoteContext {
  supabase: ReturnType<typeof createClient>
  doctor: { id: string; plan: string | null }
}

/** Médecin connecté + contrôle de forfait. Renvoie une réponse d'erreur prête
 *  à retourner, ou le contexte. */
export async function requireQuoteDoctor(
  feature: keyof PlanFeatures = 'records',
): Promise<{ error: NextResponse } | { ctx: QuoteContext }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }

  if (!canAccess(doctor.plan, feature)) {
    return {
      error: NextResponse.json(
        { error: 'Les devis nécessitent le forfait Cabinet complet' }, { status: 403 }),
    }
  }
  return { ctx: { supabase, doctor } }
}

/** Le devis existe ET appartient au médecin. Un devis d'un autre cabinet doit
 *  répondre « introuvable » (404) et non « interdit » : un 403 confirmerait au
 *  curieux que l'identifiant qu'il a essayé existe bien quelque part. */
export async function loadOwnedQuote(ctx: QuoteContext, quoteId: string) {
  const { data } = await ctx.supabase
    .from('quotes').select('*')
    .eq('id', quoteId).eq('doctor_id', ctx.doctor.id).maybeSingle()
  return data as { id: string; patient_id: string; status: string } | null
}

/** Une fonction, pas une constante : un objet NextResponse partagé entre deux
 *  requêtes verrait son corps déjà consommé à la seconde. */
export const quoteNotFound = () =>
  NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

const METHODES_REGLEMENT = ['especes', 'carte', 'cheque', 'virement']

/** Le minimum qu'il faut connaître du devis pour lui accrocher un versement. */
export interface QuoteCible { id: string; patient_id: string; status: string }

/**
 * Enregistre un versement RÉELLEMENT reçu sur un devis.
 *
 * Ce sont les seules règles d'argent du lot devis, et elles sont ici — pas dans
 * les routes — parce que DEUX chemins y mènent depuis la v55 : le médecin
 * (/api/quotes/[id]/payments) et la secrétaire à qui il a coché « Encaisser sur
 * un devis » (/api/cabinet/quotes). Recopier la validation dans la seconde
 * route, c'est accepter qu'un garde-fou corrigé d'un côté reste ouvert de
 * l'autre : le refus du trop-perçu ou de la date future finirait par ne valoir
 * que pour le médecin, c'est-à-dire pour celui dont on se méfie le moins.
 *
 * `db` est volontairement non typé : le médecin passe le client RLS de sa
 * session, la secrétaire le client admin (les tables quote_* sont réservées au
 * médecin propriétaire, cf. v54). Les deux clients ont la même API mais des
 * types nominaux différents, et la seule alternative serait un générique qui
 * n'apporterait aucune sécurité réelle ici — l'appartenance du devis est
 * vérifiée par l'appelant AVANT d'arriver ici.
 */
export async function enregistrerVersement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  quote: QuoteCible,
  doctorId: string,
  body: Record<string, unknown>,
): Promise<{ error: NextResponse } | { payment: Record<string, unknown> }> {
  if (quote.status === 'annule' || quote.status === 'refuse') {
    return {
      error: NextResponse.json({
        error: 'Ce devis est annulé ou refusé : rouvrez-le avant d\'encaisser.',
      }, { status: 409 }),
    }
  }

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return { error: NextResponse.json({ error: 'Montant invalide' }, { status: 400 }) }
  }

  const method = body.payment_method ? String(body.payment_method) : null
  if (method && !METHODES_REGLEMENT.includes(method)) {
    return { error: NextResponse.json({ error: 'Mode de règlement invalide' }, { status: 400 }) }
  }

  // Date de règlement : on peut saisir mercredi un chèque encaissé lundi — il
  // appartient au lundi. Une date future serait en revanche de l'argent pas
  // encore reçu : c'est ce que l'échéancier sert à représenter, et l'accepter
  // ici gonflerait le CA du mois.
  let paidAt = new Date().toISOString()
  if (body.paid_at) {
    const d = new Date(String(body.paid_at))
    if (isNaN(d.getTime())) return { error: NextResponse.json({ error: 'Date invalide' }, { status: 400 }) }
    // Tolérance d'une journée : le fuseau du navigateur peut placer
    // « aujourd'hui » quelques heures devant le serveur.
    if (d.getTime() > Date.now() + 24 * 3600 * 1000) {
      return {
        error: NextResponse.json({
          error: 'Un versement ne peut pas être daté dans le futur. Utilisez l\'échéancier pour ce qui est prévu.',
        }, { status: 400 }),
      }
    }
    paidAt = d.toISOString()
  }

  // Trop-perçu : on refuse d'encaisser plus que le devis ne vaut. Un patient qui
  // paie davantage règle autre chose, qui doit apparaître ailleurs — sans ce
  // garde-fou, un zéro de trop passerait directement dans le CA.
  const [{ data: items }, { data: payments }] = await Promise.all([
    db.from('quote_items').select('unit_price, quantity').eq('quote_id', quote.id),
    db.from('quote_payments').select('amount').eq('quote_id', quote.id),
  ])
  const total = quoteTotal(items ?? [])
  const deja = quotePaid(payments ?? [])
  const reste = round2(total - deja)
  if (total > 0 && amount > reste) {
    return {
      error: NextResponse.json({
        error: `Il ne reste que ${reste} DH à régler sur ce devis.`,
      }, { status: 400 }),
    }
  }

  const { data, error } = await db
    .from('quote_payments')
    .insert({
      quote_id: quote.id,
      doctor_id: doctorId,        // recalé sur le devis parent par le trigger v54
      patient_id: quote.patient_id,
      amount,
      payment_method: method,
      paid_at: paidAt,
      note: body.note ? String(body.note).slice(0, 300) : null,
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[Devis] versement impossible :', error?.message)
    return {
      error: NextResponse.json({ error: 'Le versement n\'a pas pu être enregistré' }, { status: 500 }),
    }
  }

  // Devis soldé : on le passe en « terminé » de façon visible. Le statut ne
  // change RIEN à la comptabilité (le CA vient des versements) — il sert à ce
  // que le médecin arrête de relancer un patient qui a fini de payer. C'est la
  // SEULE écriture de statut qu'un encaissement autorise, et elle est
  // automatique : elle ne donne pas à la secrétaire le droit de choisir un
  // statut, elle constate qu'il ne reste rien à payer.
  if (total > 0 && round2(deja + amount) >= total && quote.status !== 'termine') {
    await db.from('quotes')
      .update({ status: 'termine', updated_at: new Date().toISOString() })
      .eq('id', quote.id).eq('doctor_id', doctorId)
  }

  return { payment: data as Record<string, unknown> }
}
