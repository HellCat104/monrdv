// Historique par dent (table tooth_history, migration v55) — calcul de la
// différence et mise en français.
//
// `dental_charts` est écrasé à chaque enregistrement : il dit l'état actuel
// d'une bouche, jamais son histoire. Ce module produit la seconde, en
// comparant le schéma qui était en base et celui que l'on s'apprête à écrire.
//
// Il est volontairement PUR (aucun accès base, aucun import serveur) : la même
// fonction sert à écrire le journal côté serveur et à le relire côté écran,
// donc les deux ne peuvent pas diverger. Toute la connaissance des états d'une
// dent reste dans lib/dental.ts — ce fichier ne fait que comparer et raconter.

import { formatInTimeZone } from 'date-fns-tz'
import { fr } from 'date-fns/locale'
import { MAROC_TZ } from '@/lib/utils'
import {
  normalizeTeeth, statesLabel, toothStates,
  type DentalTeeth, type StoredDentalTeeth, type ToothStatus,
} from '@/lib/dental'

/** Rôle de l'auteur du changement — repris de lib/audit.ts (AuditActor). */
export type ToothActorRole = 'medecin' | 'secretaire' | 'admin'

/** Une ligne de tooth_history, telle qu'elle revient de la base. */
export interface ToothEvent {
  id: string
  tooth: string
  states_before: ToothStatus[]
  states_after: ToothStatus[]
  note: string | null
  actor_role: ToothActorRole
  actor_email: string | null
  created_at: string
}

/** Un changement constaté sur UNE dent, prêt à être inséré en base. */
export interface ToothChange {
  tooth: string
  before: ToothStatus[]
  after: ToothStatus[]
  /** La note de la dent après le changement (contexte, cf. colonne `note`). */
  note: string | null
}

/** Deux jeux d'états sont identiques si ce sont les mêmes états : toothStates()
 *  les a déjà dédoublonnés et triés dans l'ordre canonique, une comparaison
 *  positionnelle suffit donc — et évite un tri de plus à chaque dent. */
function sameStates(a: ToothStatus[], b: ToothStatus[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i])
}

// Différence entre le schéma stocké et le schéma soumis, dent par dent.
//
// Les deux entrées passent par normalizeTeeth() : c'est ce qui permet à une
// ligne ancienne, encore au format chaîne ({"16":{"s":"carie"}}), d'être lue
// comme un état de départ correct au lieu d'être prise pour une dent vierge —
// sans quoi la première modification d'un vieux dossier apparaîtrait à tort
// comme une création, et l'état antérieur serait perdu pour de bon.
//
// Une dent absente des deux côtés, ou dont les états n'ont pas bougé, ne
// produit RIEN : le journal ne consigne que ce qui a réellement changé.
export function diffTeeth(
  before: StoredDentalTeeth | DentalTeeth | null | undefined,
  after: StoredDentalTeeth | DentalTeeth | null | undefined,
): ToothChange[] {
  const av = normalizeTeeth(before)
  const ap = normalizeTeeth(after)
  const changes: ToothChange[] = []

  // L'union des deux jeux de clés : une dent effacée n'existe plus que du côté
  // « avant », une dent nouvelle que du côté « après ».
  for (const tooth of Array.from(new Set([...Object.keys(av), ...Object.keys(ap)]))) {
    const a = toothStates(av[tooth])
    const b = toothStates(ap[tooth])
    if (sameStates(a, b)) continue
    changes.push({ tooth, before: a, after: b, note: ap[tooth]?.n ?? null })
  }
  // Ordre de dent stable : deux dents modifiées d'un même geste apparaissent
  // toujours dans le même ordre, à l'écran comme dans un export.
  return changes.sort((x, y) => Number(x.tooth) - Number(y.tooth))
}

/** Nature du changement — sert autant au libellé qu'à la couleur de la pastille. */
export type ToothChangeKind = 'creation' | 'ajout' | 'retrait' | 'remplacement' | 'effacement'

// Met le changement en français de praticien. Un dentiste qui rouvre un dossier
// trois ans plus tard veut lire ce qu'il a fait, pas décoder une notation :
// « Ajout : Couronne » se comprend d'un coup d'œil, « ["carie"] → ["carie",
// "couronne"] » non. On ne montre l'état complet des deux côtés que lorsque la
// dent a changé de nature (remplacement), seul cas où l'avant/après compte.
export function describeToothChange(
  before: ToothStatus[],
  after: ToothStatus[],
): { kind: ToothChangeKind; texte: string } {
  if (before.length === 0) return { kind: 'creation', texte: statesLabel(after) }
  if (after.length === 0) return { kind: 'effacement', texte: `Plus aucun état (était : ${statesLabel(before)})` }

  const ajoutes = after.filter((s) => !before.includes(s))
  const retires = before.filter((s) => !after.includes(s))
  if (ajoutes.length > 0 && retires.length === 0) return { kind: 'ajout', texte: `Ajout : ${statesLabel(ajoutes)}` }
  if (retires.length > 0 && ajoutes.length === 0) return { kind: 'retrait', texte: `Retrait : ${statesLabel(retires)}` }
  return { kind: 'remplacement', texte: `${statesLabel(before)} → ${statesLabel(after)}` }
}

// « 12 mars 2026 ». Pas d'heure : elle encombre une liste qui se lit à la
// verticale et n'apporte rien à un fait clinique daté au jour. Elle reste
// disponible en infobulle (cf. toothEventTitle).
export function formatToothEventDate(iso: string): string {
  try {
    return formatInTimeZone(iso, MAROC_TZ, 'd MMMM yyyy', { locale: fr })
  } catch {
    return iso.slice(0, 10)
  }
}

// Infobulle : l'horodatage complet et l'auteur. Le journal doit pouvoir être
// opposé à quelqu'un — il faut donc que le « qui » soit consultable, sans pour
// autant alourdir chaque ligne à l'écran.
export function toothEventTitle(ev: ToothEvent): string {
  let quand: string
  try {
    quand = formatInTimeZone(ev.created_at, MAROC_TZ, "d MMMM yyyy 'à' HH:mm", { locale: fr })
  } catch {
    quand = ev.created_at
  }
  const roles: Record<ToothActorRole, string> = {
    medecin: 'le praticien',
    secretaire: 'le secrétariat',
    admin: 'un administrateur',
  }
  const qui = roles[ev.actor_role] ?? ev.actor_role
  return `${quand} — saisi par ${qui}${ev.actor_email ? ` (${ev.actor_email})` : ''}`
}

// Normalise une ligne lue en base. Les colonnes text[] peuvent contenir des
// valeurs devenues inconnues (un état retiré du produit un jour) : on les
// filtre par toothStates(), le même point de passage que partout ailleurs.
export function parseToothEvent(row: {
  id: string
  tooth: string
  states_before: string[] | null
  states_after: string[] | null
  note: string | null
  actor_role: string | null
  actor_email: string | null
  created_at: string
}): ToothEvent {
  return {
    id: row.id,
    tooth: row.tooth,
    states_before: toothStates({ s: (row.states_before ?? []) as ToothStatus[] }),
    states_after: toothStates({ s: (row.states_after ?? []) as ToothStatus[] }),
    note: row.note,
    actor_role: (row.actor_role === 'secretaire' || row.actor_role === 'admin' ? row.actor_role : 'medecin'),
    actor_email: row.actor_email,
    created_at: row.created_at,
  }
}
