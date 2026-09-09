// Devis (plan de traitement chiffré) — calculs partagés entre l'interface et
// le serveur, comme lib/plan.ts l'est pour les forfaits.
//
// Tout ce qui suit est volontairement SANS effet de bord et sans accès base :
// ce sont les trois seules opérations d'argent d'un devis, et elles doivent
// donner exactement le même résultat dans l'écran du médecin, dans les routes
// API et dans la facture imprimée. Les recopier à trois endroits, c'est
// s'exposer à ce qu'un arrondi diverge et qu'un patient voie un reste dû
// différent de celui de sa facture.
//
// Rappel comptable (détaillé dans supabase/migration_v54_devis.sql) :
//   total du devis  = ce qui est PROPOSÉ            → jamais du chiffre d'affaires
//   échéancier      = ce qui est PRÉVU              → jamais du chiffre d'affaires
//   versements      = ce qui est REÇU               → le seul chiffre d'affaires
// Ces trois montants ne s'additionnent jamais entre eux.

import type { QuoteInstallment, QuoteItem, QuotePayment } from '@/types'

/** Arrondi au centime. Les prix sont en NUMERIC(10,2) côté base : on s'aligne
 *  pour ne pas afficher 2499.9999999 après une somme de flottants. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Montant d'une ligne : prix unitaire × quantité. */
export function itemTotal(item: Pick<QuoteItem, 'unit_price' | 'quantity'>): number {
  return round2(Number(item.unit_price ?? 0) * Number(item.quantity ?? 1))
}

/** Total PROPOSÉ au patient. Informatif : ne produit aucune recette. */
export function quoteTotal(items: Pick<QuoteItem, 'unit_price' | 'quantity'>[]): number {
  return round2(items.reduce((s, i) => s + itemTotal(i), 0))
}

/** Total RÉELLEMENT encaissé sur le devis. C'est cette somme, et elle seule,
 *  qui entre dans la caisse, les factures et les statistiques. */
export function quotePaid(payments: Pick<QuotePayment, 'amount'>[]): number {
  return round2(payments.reduce((s, p) => s + Number(p.amount ?? 0), 0))
}

/** Reste dû = proposé − reçu. Jamais négatif à l'affichage : un patient qui a
 *  trop versé n'a pas « −200 DH à payer », il a un avoir à régulariser. */
export function quoteRemaining(
  items: Pick<QuoteItem, 'unit_price' | 'quantity'>[],
  payments: Pick<QuotePayment, 'amount'>[],
): number {
  return round2(Math.max(0, quoteTotal(items) - quotePaid(payments)))
}

/** Total PRÉVU par l'échéancier. Affiché à part, jamais additionné aux
 *  versements : un échéancier n'est pas de l'argent. */
export function installmentsTotal(list: Pick<QuoteInstallment, 'amount'>[]): number {
  return round2(list.reduce((s, e) => s + Number(e.amount ?? 0), 0))
}

/**
 * Répartit `total` en `count` échéances mensuelles à partir de `firstDate`.
 *
 * Le reste de la division tombe sur la DERNIÈRE échéance et non sur la
 * première : le patient qui signe voit d'abord la mensualité ronde qu'on lui a
 * annoncée. 2500 DH en 3 fois donne 833,33 / 833,33 / 833,34 — la somme fait
 * exactement 2500, ce qui évite un reliquat d'un centime impossible à solder.
 */
export function buildInstallments(
  total: number,
  count: number,
  firstDate: string,
): { due_date: string; amount: number }[] {
  if (!(total > 0) || !Number.isInteger(count) || count < 1) return []
  const base = Math.floor((total / count) * 100) / 100
  const out: { due_date: string; amount: number }[] = []
  // Date de départ manipulée en UTC : on ne fait qu'ajouter des mois à une date
  // civile (pas d'heure), le fuseau n'a donc aucune influence ici.
  const [y, m, d] = firstDate.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(y, m - 1 + i, 1))
    // Une échéance au 31 tombe au 28/30 pour les mois plus courts.
    const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
    dt.setUTCDate(Math.min(d, lastDay))
    const amount = i === count - 1 ? round2(total - base * (count - 1)) : base
    out.push({ due_date: dt.toISOString().slice(0, 10), amount })
  }
  return out
}
