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

// ── Validité du devis (migration v58) ───────────────────────────────────────
//
// Décision de la propriétaire, appliquée à la lettre : un TEXTE LIBRE, saisi
// par le médecin devis par devis, VIDE par défaut. Sur le document, la ligne
// s'imprime « Valable » + ce texte (« 3 mois » → « Valable 3 mois ») ; texte
// vide → aucune ligne. Pas de liste de durées, pas de date calculée, pas de
// valeur proposée : la durée pendant laquelle un praticien s'engage sur un
// prix est son choix, et une valeur par défaut finirait imprimée sans avoir
// été lue.
//
// Le texte vit SUR LE DEVIS (quotes.validity_text), pas dans les Paramètres du
// médecin : ce qui a été écrit sur le papier remis au patient ne doit pas
// changer le jour où le médecin modifie une préférence générale.
//
// La normalisation est ici, et non dans chaque route, parce que trois
// endroits l'appliquent : la création (POST /api/quotes), la modification
// (PATCH /api/quotes/[id]) et le formulaire, qui s'en sert pour savoir si la
// saisie diffère de ce qui est enregistré. La contrainte
// `quotes_validity_text_check` (v58) tient les mêmes règles en base.

/** Longueur maximale, espaces normalisés. Doit rester égale au plafond de la
 *  contrainte `quotes_validity_text_check` (v58). 120 caractères couvrent
 *  largement « 6 mois à compter de la date d'émission, sous réserve de
 *  l'examen clinique » ; au-delà, ce n'est plus une mention de validité. */
export const VALIDITE_MAX = 120

export type ValiditeNormalisee = { ok: true; value: string | null } | { ok: false; error: string }

/**
 * Nettoie la saisie de validité : `null` si elle est vide, sinon un texte sur
 * une ligne, sans espaces superflus ni caractères de contrôle.
 *
 * Un « Valable » tapé en tête par le médecin est retiré : le formulaire
 * affiche déjà ce mot devant le champ et le document l'imprime, un médecin
 * qui le recopie obtiendrait « Valable Valable 3 mois » sur la page remise au
 * patient. Seul ce mot en tête est concerné ; le reste du texte est gardé tel
 * qu'il a été écrit.
 */
export function normaliserValidite(saisie: unknown): ValiditeNormalisee {
  if (saisie === null || saisie === undefined) return { ok: true, value: null }
  if (typeof saisie !== 'string') return { ok: false, error: 'La validité doit être un texte.' }
  const texte = saisie
    // Caractères de contrôle autres que les blancs (C0 et C1) : invisibles à
    // l'écran, refusés par la contrainte v58. On les retire plutôt que de
    // refuser une saisie dont le médecin ne verrait pas le défaut.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, '')
    // Retours à la ligne, tabulations, espaces insécables : une seule espace.
    // La mention tient sur une ligne du document.
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^valable\b[\s:.,-]*/i, '')
  if (texte === '') return { ok: true, value: null }
  if (texte.length > VALIDITE_MAX) {
    return { ok: false, error: `La validité ne peut pas dépasser ${VALIDITE_MAX} caractères (${texte.length} saisis).` }
  }
  return { ok: true, value: texte }
}

/** La ligne imprimée sur le devis, ou null s'il n'y en a pas. Le seul endroit
 *  où « Valable » est accolé au texte du médecin. */
export function ligneValidite(validite: string | null | undefined): string | null {
  const v = (validite ?? '').trim()
  return v ? `Valable ${v}` : null
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
