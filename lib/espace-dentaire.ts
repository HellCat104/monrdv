// L'ESPACE PATIENT DU DENTISTE — ce qu'on déduit du dossier, en un seul endroit.
//
// ── UN DOSSIER, DEUX MODES ──────────────────────────────────────────────────
//
// Le dentiste travaille sur UN dossier patient, de deux façons :
//   · en mode DOSSIER, il comprend le patient — son histoire, ses dents, ses
//     radios, son plan de traitement ;
//   · en mode CONSULTATION, il travaille au fauteuil, avec seulement ce qui
//     sert à l'examen, au diagnostic et au soin.
//
// Les deux modes lisent et écrivent les MÊMES tables : il n'existe pas de
// « données de consultation » qui devraient ensuite être recopiées dans le
// dossier. Une dent modifiée au fauteuil est modifiée dans le dossier, parce
// que c'est la même ligne.
//
// ── CE MODULE ───────────────────────────────────────────────────────────────
//
// Il est PUR : il reçoit des lignes déjà lues et rend des conclusions. Aucun
// accès à la base, aucune date « maintenant » (le jour est un paramètre).
// C'est ce qui permet de le tester sans base, et c'est aussi la règle qui
// évite que le mode Dossier et le mode Consultation calculent chacun « le
// dernier diagnostic » à leur façon : ils appellent tous les deux ce fichier.
//
// La lecture en base vit dans lib/espace-dentaire-serveur.ts.

import { jourImage, libelleType, estImagerie, imagesDeLaDent, type ImageDentaire } from './imagerie'

// ── Les lignes dont on part ─────────────────────────────────────────────────

export interface RdvLu {
  id: string
  date: string
  time?: string | null
  status?: string | null
  queue_status?: string | null
  motif?: string | null
}

export interface ConsultationLue {
  id: string
  appointment_id?: string | null
  date_consultation?: string | null
  created_at: string
  statut?: string | null
  motif?: string | null
  diagnostic?: string | null
  traitement?: string | null
  dents?: string[] | null
}

export interface LignePlanLue {
  id: string
  tooth: string | null
  label: string
  done: boolean
  done_at?: string | null
  appointment_id?: string | null
  session_no?: number | null
  unit_price?: number | null
  quantity?: number | null
}

export interface PlanLu {
  id: string
  label: string | null
  status: string
  created_at: string
  items: LignePlanLue[]
}

export interface DossierDentaire {
  allergies?: string | null
  traitements?: string | null
  /** Les libellés de risques déjà calculés par lib/anamnese (risquesActifs). */
  risques?: string[]
  rdvs: RdvLu[]
  consultations: ConsultationLue[]
  plans: PlanLu[]
  images: ImageDentaire[]
}

// ── Le rendez-vous « en cours » ─────────────────────────────────────────────

/** Le rendez-vous d'AUJOURD'HUI sur lequel le mode Consultation s'ouvre.
 *
 *  Le patient en consultation d'abord, puis celui qui attend, puis le
 *  premier rendez-vous du jour qui n'est ni annulé ni terminé. Un rendez-vous
 *  d'un autre jour ne s'ouvre pas en consultation par défaut : rouvrir une
 *  séance passée se fait depuis l'historique, en connaissance de cause. */
export function rdvDuJour(rdvs: RdvLu[], aujourdhui: string): RdvLu | null {
  const duJour = rdvs
    .filter((r) => r.date === aujourdhui && r.status !== 'cancelled')
    .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')))
  const rang = (r: RdvLu) => (
    r.queue_status === 'en_consultation' ? 0
    : r.queue_status === 'arrive' ? 1
    : r.queue_status === 'parti' || r.queue_status === 'hopital' ? 3
    : 2
  )
  // `hopital` : le patient a été adressé ailleurs, la séance est finie.
  const ouverts = duJour.filter((r) => r.queue_status !== 'parti' && r.queue_status !== 'hopital')
  if (ouverts.length > 0) return [...ouverts].sort((a, b) => rang(a) - rang(b))[0]
  return null
}

// ── La synthèse avant consultation ──────────────────────────────────────────

export interface SyntheseDentaire {
  derniereVisite: {
    date: string
    motif: string | null
    diagnostic: string | null
    /** La consultation structurée de cette visite, pour ouvrir son compte rendu. */
    consultationId: string | null
  } | null
  /** Le plan de traitement en cours (accepté, pas terminé), s'il y en a un. */
  planActif: {
    id: string
    titre: string
    restants: number
    faits: number
    /** La prochaine ligne à faire : séance prévue la plus proche, sinon la première. */
    prochain: string | null
  } | null
  /** Les plans proposés qui attendent la réponse du patient. */
  plansEnAttente: number
  derniereRadio: { date: string; estime: boolean; type: string; dents: string[] } | null
  allergies: string | null
  traitements: string | null
  risques: string[]
  /** Rien à résumer : le dossier est neuf. L'écran le dit au lieu d'un cadre vide. */
  vide: boolean
}

function texte(s?: string | null): string | null {
  const t = (s ?? '').trim()
  return t ? t : null
}

/** Première ligne non vide d'un texte : le diagnostic tient en une ligne
 *  dans une synthèse, le compte rendu complet reste à un clic. */
export function premiereLigne(s?: string | null, max = 140): string | null {
  // Une ligne de trame restée vide (« Secondaires : ») n'est pas un contenu :
  // on la saute, sinon la synthèse afficherait « Principal : » tout seul.
  const l = (s ?? '').split('\n').map((x) => x.trim())
    .find((x) => x && !/^[^:]{1,40}:\s*$/.test(x))
  if (!l) return null
  return l.length > max ? `${l.slice(0, max - 1)}…` : l
}

export function syntheseDentaire(d: DossierDentaire, aujourdhui: string): SyntheseDentaire {
  // LA DERNIÈRE VISITE : le dernier rendez-vous passé et honoré, AVANT
  // aujourd'hui. Celui du jour n'est pas « le précédent ».
  const passes = d.rdvs
    .filter((r) => r.date < aujourdhui && r.status !== 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? '')))
  const dernierRdv = passes[0] ?? null

  // Sa consultation structurée, si elle existe : rattachée au rendez-vous,
  // sinon la dernière consultation datée d'avant aujourd'hui.
  const consults = [...d.consultations].sort((a, b) =>
    (b.date_consultation ?? b.created_at).localeCompare(a.date_consultation ?? a.created_at))
  const consultDuRdv = dernierRdv
    ? consults.find((c) => c.appointment_id === dernierRdv.id) ?? null
    : null
  const derniereConsult = consultDuRdv
    ?? consults.find((c) => (c.date_consultation ?? c.created_at).slice(0, 10) < aujourdhui)
    ?? null

  let derniereVisite: SyntheseDentaire['derniereVisite'] = null
  if (dernierRdv || derniereConsult) {
    const date = dernierRdv?.date ?? (derniereConsult!.date_consultation ?? derniereConsult!.created_at).slice(0, 10)
    derniereVisite = {
      date,
      motif: texte(derniereConsult?.motif) ?? texte(dernierRdv?.motif),
      diagnostic: premiereLigne(derniereConsult?.diagnostic),
      consultationId: derniereConsult?.id ?? null,
    }
  }

  // LE PLAN ACTIF : accepté et pas terminé. S'il y en a plusieurs, le plus
  // récent — c'est celui sur lequel on travaille.
  const actifs = d.plans
    .filter((p) => p.status === 'accepte')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const plan = actifs[0] ?? null
  let planActif: SyntheseDentaire['planActif'] = null
  if (plan) {
    const restantes = plan.items.filter((i) => !i.done)
    const parSeance = [...restantes].sort((a, b) =>
      (a.session_no ?? 999) - (b.session_no ?? 999))
    const prochaine = parSeance[0] ?? null
    planActif = {
      id: plan.id,
      titre: texte(plan.label) ?? 'Plan de traitement',
      restants: restantes.length,
      faits: plan.items.length - restantes.length,
      prochain: prochaine ? `${prochaine.label}${prochaine.tooth ? ` (dent ${prochaine.tooth})` : ''}` : null,
    }
  }

  // LA DERNIÈRE RADIO : la plus récente par date d'examen.
  const radios = d.images.filter(estImagerie)
    .sort((a, b) => jourImage(b).jour.localeCompare(jourImage(a).jour))
  const r = radios[0] ?? null

  const synthese: SyntheseDentaire = {
    derniereVisite,
    planActif,
    plansEnAttente: d.plans.filter((p) => p.status === 'propose').length,
    derniereRadio: r ? { ...jourImage(r), date: jourImage(r).jour, type: libelleType(r.type_image), dents: r.dents ?? [] } : null,
    allergies: texte(d.allergies),
    traitements: texte(d.traitements),
    risques: d.risques ?? [],
    vide: false,
  }
  synthese.vide = !synthese.derniereVisite && !synthese.planActif && !synthese.derniereRadio
    && !synthese.allergies && !synthese.traitements && synthese.risques.length === 0
    && synthese.plansEnAttente === 0
  return synthese
}

// ── Ce que le dossier sait d'UNE dent ───────────────────────────────────────

export interface ContexteDent {
  /** Les lignes du plan de traitement qui visent cette dent. */
  plan: (LignePlanLue & { planTitre: string; planStatut: string })[]
  /** Les clichés de la dent, du plus récent au plus ancien (panoramiques comprises). */
  images: ImageDentaire[]
}

/** Tout ce qui, hors du schéma lui-même, concerne cette dent. Le panneau de
 *  la dent le montre à côté de son état et de son historique : c'est ce qui
 *  évite d'ouvrir trois onglets pour comprendre la 36. */
export function contexteDent(dent: string, plans: PlanLu[], images: ImageDentaire[]): ContexteDent {
  const plan = plans
    .filter((p) => p.status !== 'annule')
    .flatMap((p) => p.items
      .filter((i) => i.tooth === dent)
      .map((i) => ({ ...i, planTitre: texte(p.label) ?? 'Plan de traitement', planStatut: p.status })))
    // À faire d'abord, puis le fait du plus récent au plus ancien.
    .sort((a, b) => Number(a.done) - Number(b.done)
      || String(b.done_at ?? '').localeCompare(String(a.done_at ?? '')))
  return { plan, images: imagesDeLaDent(images, dent) }
}

// ── L'historique par visite ─────────────────────────────────────────────────

export interface ChangementDentLu {
  tooth: string
  appointment_id?: string | null
  texte: string
}

export interface VisiteDentaire {
  rdv: RdvLu
  consultation: ConsultationLue | null
  actes: LignePlanLue[]
  dents: ChangementDentLu[]
  images: ImageDentaire[]
  ordonnances: number
  /** Les numéros de dents touchés ce jour-là, toutes sources confondues. */
  dentsConcernees: string[]
}

/** Regroupe, par rendez-vous, tout ce qui a été fait pendant la séance.
 *
 *  Le rattachement est EXACT quand la ligne connaît sa séance
 *  (`appointment_id`). Pour un cliché ancien qui ne la connaît pas, on
 *  retient la date d'examen égale au jour du rendez-vous — c'est la même
 *  journée, le praticien ne voit pas de différence. On ne fait PAS ce
 *  rapprochement pour les changements de dents : un changement sans séance
 *  a été fait depuis le dossier, et le dater d'une visite serait inventer. */
export function regrouperParVisite(
  rdvs: RdvLu[],
  sources: {
    consultations: ConsultationLue[]
    plans: PlanLu[]
    changements: ChangementDentLu[]
    images: ImageDentaire[]
    ordonnances: { appointment_id?: string | null }[]
  },
): VisiteDentaire[] {
  const actes = sources.plans.flatMap((p) => p.items)
  return rdvs.map((rdv) => {
    const consultation = sources.consultations.find((c) => c.appointment_id === rdv.id) ?? null
    const actesDuRdv = actes.filter((a) => a.done && a.appointment_id === rdv.id)
    const dents = sources.changements.filter((c) => c.appointment_id === rdv.id)
    const images = sources.images.filter((i) => {
      const seance = (i as ImageDentaire & { appointment_id?: string | null }).appointment_id
      if (seance) return seance === rdv.id
      const j = jourImage(i)
      return !j.estime && j.jour === rdv.date
    })
    const dentsConcernees = Array.from(new Set([
      ...(consultation?.dents ?? []),
      ...actesDuRdv.map((a) => a.tooth).filter((t): t is string => !!t),
      ...dents.map((c) => c.tooth),
      ...images.flatMap((i) => i.dents ?? []),
    ])).sort()
    return {
      rdv, consultation, actes: actesDuRdv, dents, images,
      ordonnances: sources.ordonnances.filter((o) => o.appointment_id === rdv.id).length,
      dentsConcernees,
    }
  })
}

/** Une visite sans rien d'enregistré se montre quand même — elle a eu lieu —
 *  mais plus discrètement. */
export function visiteVide(v: VisiteDentaire): boolean {
  return !v.consultation && v.actes.length === 0 && v.dents.length === 0
    && v.images.length === 0 && v.ordonnances === 0
}

// ── Avant de terminer ───────────────────────────────────────────────────────

export interface PointCloture {
  niveau: 'ok' | 'attention'
  texte: string
}

/** Ce que l'on vérifie avant de terminer une consultation dentaire.
 *
 *  Rien de ceci n'EMPÊCHE de terminer : une consultation de contrôle sans
 *  diagnostic ni acte est une consultation normale. On montre ce qui est
 *  enregistré, et on signale ce qui manque peut-être — le praticien juge. */
export function pointsDeCloture(s: {
  consultationEcrite: boolean
  diagnostic: boolean
  actesFaits: number
  dentsModifiees: number
  ordonnances: number
  images: number
  noteLibre: boolean
}): PointCloture[] {
  const p: PointCloture[] = []
  if (s.consultationEcrite) p.push({ niveau: 'ok', texte: 'Consultation enregistrée' })
  else if (s.noteLibre) p.push({ niveau: 'ok', texte: 'Note de consultation enregistrée' })
  else p.push({ niveau: 'attention', texte: 'Ni consultation ni note écrite pour cette séance' })

  if (s.diagnostic) p.push({ niveau: 'ok', texte: 'Diagnostic noté' })
  else if (s.actesFaits > 0) p.push({ niveau: 'attention', texte: 'Des actes sont faits, mais aucun diagnostic n’est noté' })

  if (s.actesFaits > 0) p.push({ niveau: 'ok', texte: `${s.actesFaits} acte${s.actesFaits > 1 ? 's' : ''} du plan marqué${s.actesFaits > 1 ? 's' : ''} fait${s.actesFaits > 1 ? 's' : ''}` })
  if (s.dentsModifiees > 0) p.push({ niveau: 'ok', texte: `${s.dentsModifiees} modification${s.dentsModifiees > 1 ? 's' : ''} sur le schéma dentaire` })
  if (s.ordonnances > 0) p.push({ niveau: 'ok', texte: `${s.ordonnances} ordonnance${s.ordonnances > 1 ? 's' : ''}` })
  if (s.images > 0) p.push({ niveau: 'ok', texte: `${s.images} cliché${s.images > 1 ? 's' : ''} ajouté${s.images > 1 ? 's' : ''}` })
  return p
}
