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
  normalizeTeeth, statesLabel, toothStates, natureDe, NATURE_LABEL,
  type DentalTeeth, type StoredDentalTeeth, type ToothStatus, toothFaces, facesLabel, type ToothFace,
  type ToothNature } from '@/lib/dental'

/** Rôle de l'auteur du changement — repris de lib/audit.ts (AuditActor). */
export type ToothActorRole = 'medecin' | 'secretaire' | 'admin'

/** Une ligne de tooth_history, telle qu'elle revient de la base. */
export interface ToothEvent {
  id: string
  tooth: string
  states_before: ToothStatus[]
  states_after: ToothStatus[]
  /** Faces par état, avant et après — vides tant que la v66 n'est pas passée. */
  faces_before?: Partial<Record<ToothStatus, ToothFace[]>>
  faces_after?: Partial<Record<ToothStatus, ToothFace[]>>
  /** Nature de chaque état, avant et après — vides avant la v100. */
  natures_before?: Partial<Record<ToothStatus, ToothNature>>
  natures_after?: Partial<Record<ToothStatus, ToothNature>>
  /** Le rendez-vous pendant lequel le changement a été fait (v100). */
  appointment_id?: string | null
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
  /** Faces par état. Changer une face sans changer l'état reste un acte de
   *  soin : « la carie est passée de occlusale à occlusale + mésiale ». */
  facesBefore: Partial<Record<ToothStatus, ToothFace[]>>
  facesAfter: Partial<Record<ToothStatus, ToothFace[]>>
  /** Nature de chaque état. Passer un état de « à faire » à « réalisé » est
   *  LE moment qui compte : celui où le soin est fait. Il doit laisser une
   *  ligne, même si rien d'autre n'a bougé sur la dent. */
  naturesBefore: Partial<Record<ToothStatus, ToothNature>>
  naturesAfter: Partial<Record<ToothStatus, ToothNature>>
  /** La note de la dent après le changement (contexte, cf. colonne `note`). */
  note: string | null
}

/** Deux jeux d'états sont identiques si ce sont les mêmes états : toothStates()
 *  les a déjà dédoublonnés et triés dans l'ordre canonique, une comparaison
 *  positionnelle suffit donc — et évite un tri de plus à chaque dent. */
function sameStates(a: ToothStatus[], b: ToothStatus[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i])
}

/** Les faces de deux jeux d'états, état par état. toothFaces() les a déjà
 *  triées : une comparaison positionnelle suffit. */
function sameFaces(
  a: Partial<Record<ToothStatus, ToothFace[]>>,
  b: Partial<Record<ToothStatus, ToothFace[]>>,
): boolean {
  const cles = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])) as ToothStatus[]
  return cles.every((c) => {
    const x = a[c] ?? []
    const y = b[c] ?? []
    return x.length === y.length && x.every((f, i) => f === y[i])
  })
}

/** La nature de chaque état présent, « constaté » compris : une absence
 *  vaudrait « constaté » à la lecture, autant l'écrire, pour que deux lignes
 *  se comparent sans interprétation. */
function naturesDe(info: unknown, etats: ToothStatus[]): Partial<Record<ToothStatus, ToothNature>> {
  const out: Partial<Record<ToothStatus, ToothNature>> = {}
  for (const e of etats) out[e] = natureDe(info as never, e)
  return out
}

/** Deux jeux de natures sont identiques sur les états QUE LES DEUX portent.
 *  Un état ajouté ou retiré est déjà un changement d'état : le compter aussi
 *  comme un changement de nature le décrirait deux fois. */
function sameNatures(
  a: Partial<Record<ToothStatus, ToothNature>>,
  b: Partial<Record<ToothStatus, ToothNature>>,
): boolean {
  return (Object.keys(a) as ToothStatus[]).filter((c) => c in b).every((c) => a[c] === b[c])
}

/** Les faces d'une dent, par état présent. */
function facesDe(info: unknown, etats: ToothStatus[]): Partial<Record<ToothStatus, ToothFace[]>> {
  const out: Partial<Record<ToothStatus, ToothFace[]>> = {}
  for (const e of etats) {
    const f = toothFaces(info as never, e)
    if (f.length > 0) out[e] = f
  }
  return out
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
    const fa = facesDe(av[tooth], a)
    const fb = facesDe(ap[tooth], b)
    const na = naturesDe(av[tooth], a)
    const nb = naturesDe(ap[tooth], b)
    if (sameStates(a, b) && sameFaces(fa, fb) && sameNatures(na, nb)) continue
    changes.push({
      tooth, before: a, after: b, facesBefore: fa, facesAfter: fb,
      naturesBefore: na, naturesAfter: nb, note: ap[tooth]?.n ?? null,
    })
  }
  // Ordre de dent stable : deux dents modifiées d'un même geste apparaissent
  // toujours dans le même ordre, à l'écran comme dans un export.
  return changes.sort((x, y) => Number(x.tooth) - Number(y.tooth))
}

/** Nature du changement — sert autant au libellé qu'à la couleur de la pastille. */
export type ToothChangeKind = 'creation' | 'ajout' | 'retrait' | 'remplacement' | 'effacement' | 'faces' | 'nature'

// Met le changement en français de praticien. Un dentiste qui rouvre un dossier
// trois ans plus tard veut lire ce qu'il a fait, pas décoder une notation :
// « Ajout : Couronne » se comprend d'un coup d'œil, « ["carie"] → ["carie",
// "couronne"] » non. On ne montre l'état complet des deux côtés que lorsque la
// dent a changé de nature (remplacement), seul cas où l'avant/après compte.
export function describeToothChange(
  before: ToothStatus[],
  after: ToothStatus[],
  facesBefore?: Partial<Record<ToothStatus, ToothFace[]>>,
  facesAfter?: Partial<Record<ToothStatus, ToothFace[]>>,
  naturesBefore?: Partial<Record<ToothStatus, ToothNature>>,
  naturesAfter?: Partial<Record<ToothStatus, ToothNature>>,
): { kind: ToothChangeKind; texte: string } {
  // Mêmes états, mêmes faces, nature différente : « Obturation : à faire →
  // réalisé ». C'est la ligne qui dit qu'un soin a été fait, et par qui.
  if (before.length > 0 && after.length > 0 && sameStates(before, after)
      && sameFaces(facesBefore ?? {}, facesAfter ?? {})) {
    const na = naturesBefore ?? {}
    const nb = naturesAfter ?? {}
    const changes = after.filter((s) => na[s] && nb[s] && na[s] !== nb[s])
    if (changes.length > 0) {
      return {
        kind: 'nature',
        texte: changes
          .map((s) => `${statesLabel([s])} : ${NATURE_LABEL[na[s]!] ?? na[s]} → ${NATURE_LABEL[nb[s]!] ?? nb[s]}`)
          .join(', '),
      }
    }
  }
  // Mêmes états, faces différentes : la carie s'est étendue, ou le praticien a
  // précisé ce qu'il n'avait pas noté. C'est un acte, pas un détail.
  if (before.length > 0 && after.length > 0 && sameStates(before, after)) {
    const fa = facesBefore ?? {}
    const fb = facesAfter ?? {}
    if (!sameFaces(fa, fb)) {
      const detail = after
        .filter((s) => (fb[s] ?? []).length > 0)
        .map((s) => `${statesLabel([s])} (${facesLabel(fb[s] ?? [])})`)
        .join(', ')
      return { kind: 'faces', texte: detail ? `Faces : ${detail}` : 'Faces effacées' }
    }
  }
  if (before.length === 0) return { kind: 'creation', texte: statesLabelAvecFaces(after, facesAfter) }
  if (after.length === 0) return { kind: 'effacement', texte: `Plus aucun état (était : ${statesLabel(before)})` }

  const ajoutes = after.filter((s) => !before.includes(s))
  const retires = before.filter((s) => !after.includes(s))
  if (ajoutes.length > 0 && retires.length === 0) return { kind: 'ajout', texte: `Ajout : ${statesLabelAvecFaces(ajoutes, facesAfter)}` }
  if (retires.length > 0 && ajoutes.length === 0) return { kind: 'retrait', texte: `Retrait : ${statesLabel(retires)}` }
  return {
    kind: 'remplacement',
    texte: `${statesLabelAvecFaces(before, facesBefore)} → ${statesLabelAvecFaces(after, facesAfter)}`,
  }
}

/** « Carie (O), Plombage » — les faces quand elles existent, rien de plus. */
function statesLabelAvecFaces(
  etats: ToothStatus[],
  faces?: Partial<Record<ToothStatus, ToothFace[]>>,
): string {
  return etats
    .map((s) => {
      const f = faces?.[s] ?? []
      return f.length > 0 ? `${statesLabel([s])} (${facesLabel(f)})` : statesLabel([s])
    })
    .join(', ')
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
  faces_before?: Record<string, unknown> | null
  faces_after?: Record<string, unknown> | null
  natures_before?: Record<string, unknown> | null
  natures_after?: Record<string, unknown> | null
  appointment_id?: string | null
  note: string | null
  actor_role: string | null
  actor_email: string | null
  created_at: string
}): ToothEvent {
  const avant = toothStates({ s: (row.states_before ?? []) as ToothStatus[] })
  const apres = toothStates({ s: (row.states_after ?? []) as ToothStatus[] })
  return {
    id: row.id,
    tooth: row.tooth,
    states_before: avant,
    states_after: apres,
    faces_before: facesDe({ f: row.faces_before ?? {} }, avant),
    faces_after: facesDe({ f: row.faces_after ?? {} }, apres),
    // Une ligne antérieure à la v100 n'a pas de natures : on n'en invente pas,
    // on laisse vide — « constaté » par défaut serait une affirmation.
    natures_before: row.natures_before ? naturesDe({ p: row.natures_before }, avant) : undefined,
    natures_after: row.natures_after ? naturesDe({ p: row.natures_after }, apres) : undefined,
    appointment_id: row.appointment_id ?? null,
    note: row.note,
    actor_role: (row.actor_role === 'secretaire' || row.actor_role === 'admin' ? row.actor_role : 'medecin'),
    actor_email: row.actor_email,
    created_at: row.created_at,
  }
}
