// LE CATALOGUE DENTAIRE PRÊT À POSER — les motifs de rendez-vous d'un cabinet
// dentaire, leurs séances successives, et la couleur qui les range.
//
// ── CE QUE CE FICHIER RÉSOUT ────────────────────────────────────────────────
//
// Un cabinet qui s'installe sur MonRDV commence avec une liste de motifs
// VIDE. Il la remplit au fil des semaines, à mesure qu'il rencontre les cas :
// « Composite », puis « Composite 2 faces », puis « Compo 2F », et six mois
// plus tard la même chose s'appelle de trois façons dans l'agenda. Rien ne se
// lit, rien ne se compte.
//
// Ici, tout est posé d'un coup, nommé une seule fois, et rangé en huit
// familles.
//
// ── LES SÉANCES ─────────────────────────────────────────────────────────────
//
// La particularité du dentaire : un traitement n'est presque jamais un
// rendez-vous. Une couronne, c'est préparer et prendre l'empreinte, puis
// essayer ce que le laboratoire a monté, puis sceller. Une dévitalisation,
// c'est ouvrir et nettoyer, puis obturer. Un surfaçage, c'est quatre
// secteurs, quatre fois.
//
// Chaque séance est donc un motif À PART, numéroté et nommé par ce qu'on y
// fait : « Couronne — 2e séance : essayage » dit à l'assistante que le
// travail doit être revenu du laboratoire CE JOUR-LÀ. Un motif unique
// « Couronne » ne le dit pas.
//
// ── LA COULEUR EST CELLE DE LA FAMILLE, PAS DE LA SÉANCE ────────────────────
//
// Les trois séances d'une couronne portent la MÊME couleur. L'agenda répond
// alors à deux questions à des distances différentes : la couleur dit de loin
// de quel genre de soin il s'agit, le libellé dit de près où l'on en est.
// Une couleur par séance aurait fait un agenda bariolé qui ne répond plus à
// la première question.
//
// Huit familles, huit teintes : c'est la palette de lib/motifs-couleurs.ts,
// et c'est sa limite qui fixe le nombre de familles, pas l'inverse. Au-delà,
// deux familles se ressemblent et la couleur cesse d'informer.
//
// ── CE QUI N'EST PAS ICI ────────────────────────────────────────────────────
//
// AUCUN TARIF. Les honoraires dentaires sont libres au Maroc et varient du
// simple au triple d'un cabinet à l'autre ; un prix « suggéré » par le
// logiciel serait lu comme une référence et ne serait vrai nulle part. Le
// praticien pose les siens, motif par motif.
//
// AUCUN CODE DE NOMENCLATURE. Les codes cotés vivent dans
// lib/actes-dentaires.ts, avec leurs contraintes et leurs dix-huit codes
// douteux. Un motif d'agenda n'est pas un acte coté : « Couronne — 2e séance :
// essayage » ne se facture pas, c'est le traitement entier qui se cote.
//
// AUCUNE DURÉE QUI S'IMPOSE. Les minutes indiquées sont celles d'un cabinet
// qui tourne ; elles se modifient motif par motif dans les Paramètres.

import { COULEURS_MOTIF } from '@/lib/motifs-couleurs'
import { acteParCode, type ActeDentaire } from '@/lib/actes-dentaires'

export interface MotifPret {
  /** Le libellé tel qu'il s'affichera dans l'agenda. */
  nom: string
  minutes: number
  /** Ce rendez-vous dépend d'un travail de laboratoire (envoi ou retour). */
  labo?: boolean
  /** Le patient peut-il le choisir LUI-MÊME sur la page de réservation ?
   *
   *  Presque jamais. Un patient prend rendez-vous pour une douleur, un
   *  détartrage ou un contrôle ; il ne prend pas rendez-vous pour « Couronne —
   *  2e séance : essayage », c'est le cabinet qui lui fixe cette séance en
   *  sortant de la précédente. Ouvrir ces motifs à la réservation en ligne
   *  remplirait la page publique de termes qui ne veulent rien dire pour celui
   *  qui les lit, et laisserait prendre une 2e séance sans la première.
   *
   *  Ce choix n'est pas figé : chaque motif se bascule ensuite dans les
   *  Paramètres, « En ligne » / « Cabinet ». */
  enLigne?: boolean
  /** Les actes de nomenclature que ce rendez-vous amène le plus souvent sur
   *  la feuille de soins (codes de lib/actes-dentaires.ts).
   *
   *  Ce sont des SUGGESTIONS, proposées en tête de la feuille : rien n'est
   *  coché d'office. Une feuille de soins atteste des actes sous la signature
   *  du praticien, et le logiciel ne peut pas savoir si la molaire avait
   *  trois canaux ou si l'extraction prévue a finalement été reportée.
   *
   *  Un traitement en plusieurs séances ne propose son acte qu'à la séance
   *  qui le TERMINE — la couronne au scellement, la dévitalisation à
   *  l'obturation. La feuille porte des actes terminés ; le proposer à chaque
   *  séance ferait coter trois fois la même couronne.
   *
   *  Vide = aucun acte de la nomenclature ne correspond (implant, blanchiment,
   *  séance d'essayage) : mieux vaut ne rien proposer qu'un code à côté. */
  actes?: string[]
}

export interface FamilleMotifs {
  /** Le nom rangé dans la colonne `categorie` (v86). */
  nom: string
  /** Clé de la palette (lib/motifs-couleurs.ts). */
  couleur: string
  motifs: MotifPret[]
}

export const MOTIFS_DENTAIRES: FamilleMotifs[] = [
  {
    nom: 'Consultation et urgence',
    // Ardoise : le gris de la famille qui ne soigne pas encore. C'est la
    // couleur la plus discrète de la palette, et ces rendez-vous sont les
    // plus nombreux — un agenda où ils criaient serait illisible.
    couleur: 'ardoise',
    motifs: [
      { nom: 'Première consultation — bilan', minutes: 30, enLigne: true, actes: ['C'] },
      { nom: 'Consultation de contrôle', minutes: 15, enLigne: true, actes: ['C'] },
      { nom: 'Urgence — douleur', minutes: 20, enLigne: true, actes: ['C', 'D716'] },
      { nom: 'Présentation du plan de traitement', minutes: 20 },
    ],
  },
  {
    nom: 'Prévention',
    couleur: 'menthe',
    motifs: [
      { nom: 'Détartrage', minutes: 30, enLigne: true, actes: ['D708'] },
      { nom: 'Détartrage et polissage', minutes: 45, enLigne: true, actes: ['D708'] },
      { nom: 'Fluoration', minutes: 15, enLigne: true, actes: ['D719'] },
      { nom: 'Scellement de sillons', minutes: 30, enLigne: true, actes: ['D719'] },
      { nom: 'Enseignement de l’hygiène', minutes: 15, enLigne: true, actes: ['C'] },
    ],
  },
  {
    nom: 'Soins conservateurs',
    couleur: 'turquoise',
    motifs: [
      { nom: 'Composite — 1 face', minutes: 30, actes: ['D700'] },
      { nom: 'Composite — 2 faces ou plus', minutes: 45, actes: ['D701', 'D702'] },
      { nom: 'Reconstitution corono-radiculaire', minutes: 45, actes: ['D755'] },
      { nom: 'Inlay/Onlay — 1re séance : préparation et empreinte', minutes: 45, labo: true },
      { nom: 'Inlay/Onlay — 2e séance : collage', minutes: 30, labo: true },
    ],
  },
  {
    nom: 'Endodontie',
    couleur: 'violet',
    motifs: [
      { nom: 'Coiffage pulpaire', minutes: 30, actes: ['D707'] },
      { nom: 'Dévitalisation — 1re séance : pulpectomie', minutes: 45 },
      { nom: 'Dévitalisation — 2e séance : obturation canalaire', minutes: 45, actes: ['D704', 'D705', 'D706'] },
      { nom: 'Dévitalisation — 3e séance : contrôle radiologique', minutes: 15, actes: ['T156'] },
      { nom: 'Retraitement endodontique', minutes: 60 },
    ],
  },
  {
    nom: 'Parodontologie',
    couleur: 'citron',
    motifs: [
      { nom: 'Bilan parodontal — sondage', minutes: 30, actes: ['C'] },
      { nom: 'Surfaçage — 1re séance : secteur 1', minutes: 45, actes: ['D710'] },
      { nom: 'Surfaçage — 2e séance : secteur 2', minutes: 45, actes: ['D710'] },
      { nom: 'Surfaçage — 3e séance : secteur 3', minutes: 45, actes: ['D710'] },
      { nom: 'Surfaçage — 4e séance : secteur 4', minutes: 45, actes: ['D710'] },
      { nom: 'Réévaluation parodontale', minutes: 20, actes: ['C'] },
    ],
  },
  {
    nom: 'Chirurgie et implantologie',
    couleur: 'rose',
    motifs: [
      { nom: 'Extraction simple', minutes: 30, actes: ['D713', 'D714'] },
      { nom: 'Extraction chirurgicale — dent de sagesse', minutes: 45, actes: ['D720', 'D725'] },
      { nom: 'Contrôle post-opératoire — dépose des fils', minutes: 15 },
      { nom: 'Implant — 1re séance : pose', minutes: 60 },
      { nom: 'Implant — 2e séance : dépose des sutures', minutes: 15 },
      { nom: 'Implant — 3e séance : empreinte', minutes: 45, labo: true },
      { nom: 'Implant — 4e séance : pose de la couronne', minutes: 30, labo: true },
    ],
  },
  {
    nom: 'Prothèse et esthétique',
    couleur: 'indigo',
    motifs: [
      { nom: 'Couronne — 1re séance : préparation et empreinte', minutes: 60, labo: true, actes: ['D757'] },
      { nom: 'Couronne — 2e séance : essayage', minutes: 30, labo: true },
      { nom: 'Couronne — 3e séance : scellement', minutes: 30, labo: true, actes: ['D754'] },
      { nom: 'Bridge — 1re séance : préparation et empreinte', minutes: 75, labo: true },
      { nom: 'Bridge — 2e séance : essayage', minutes: 45, labo: true },
      { nom: 'Bridge — 3e séance : scellement', minutes: 30, labo: true, actes: ['D756'] },
      { nom: 'Prothèse amovible — 1re séance : empreinte primaire', minutes: 30, labo: true },
      { nom: 'Prothèse amovible — 2e séance : empreinte secondaire', minutes: 30, labo: true },
      { nom: 'Prothèse amovible — 3e séance : essayage en cire', minutes: 30, labo: true },
      { nom: 'Prothèse amovible — 4e séance : pose', minutes: 30, labo: true, actes: ['D748', 'D750', 'D752'] },
      { nom: 'Rebasage ou réparation de prothèse', minutes: 30, labo: true, actes: ['D751', 'D749'] },
      { nom: 'Facettes — 1re séance : préparation et empreinte', minutes: 60, labo: true },
      { nom: 'Facettes — 2e séance : collage', minutes: 45, labo: true, actes: ['D760'] },
      { nom: 'Blanchiment — 1re séance : empreintes et gouttières', minutes: 30, labo: true },
      { nom: 'Blanchiment — 2e séance : contrôle', minutes: 15 },
    ],
  },
  {
    nom: 'Orthodontie',
    couleur: 'fuchsia',
    motifs: [
      { nom: 'Bilan orthodontique — empreintes et radios', minutes: 45, labo: true, enLigne: true },
      { nom: 'Orthodontie — pose de l’appareil', minutes: 60, actes: ['D626'] },
      { nom: 'Orthodontie — activation mensuelle', minutes: 20, actes: ['D626'] },
      { nom: 'Orthodontie — dépose de l’appareil', minutes: 45, actes: ['D630'] },
      { nom: 'Orthodontie — pose de la contention', minutes: 30 },
    ],
  },
]

export const NOMBRE_MOTIFS_DENTAIRES = MOTIFS_DENTAIRES
  .reduce((n, f) => n + f.motifs.length, 0)

/** Teinte d'une famille, pour l'aperçu du catalogue avant installation. */
export function couleurDeLaFamille(famille: FamilleMotifs) {
  return COULEURS_MOTIF.find((c) => c.cle === famille.couleur) ?? null
}

/** Deux libellés désignent le même motif ?
 *
 *  On compare SANS les accents, la casse ni les espaces en trop : un cabinet
 *  qui a déjà saisi « detartrage » ne doit pas se retrouver avec un second
 *  « Détartrage » le jour où il installe le catalogue. Les tirets longs et
 *  courts sont ramenés au même, pour la même raison. */
export function memeMotif(a: string, b: string): boolean {
  return cle(a) === cle(b)
}

function cle(nom: string): string {
  return nom
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export interface MotifAInstaller extends MotifPret {
  categorie: string
  couleur: string
}

/** Combien de motifs du catalogue s'ouvrent à la réservation en ligne. */
export const NOMBRE_MOTIFS_EN_LIGNE = MOTIFS_DENTAIRES
  .reduce((n, f) => n + f.motifs.filter((m) => m.enLigne).length, 0)

/** Ce qu'il reste à poser, le catalogue moins ce que le cabinet a déjà.
 *
 *  L'installation est REJOUABLE : la relancer n'ajoute rien de ce qui existe.
 *  C'est voulu — le praticien qui a supprimé les motifs d'orthodontie parce
 *  qu'il n'en fait pas ne doit pas les voir revenir, mais celui qui a installé
 *  le catalogue il y a six mois doit pouvoir récupérer ce qui s'y est ajouté
 *  depuis. */
export function motifsAInstaller(existants: { name: string }[]): MotifAInstaller[] {
  const deja = new Set(existants.map((e) => cle(e.name ?? '')))
  const restants: MotifAInstaller[] = []
  for (const famille of MOTIFS_DENTAIRES) {
    for (const motif of famille.motifs) {
      if (deja.has(cle(motif.nom))) continue
      restants.push({ ...motif, categorie: famille.nom, couleur: famille.couleur })
    }
  }
  return restants
}

// ── LIRE UNE LISTE DE MOTIFS ────────────────────────────────────────────────

/** Les motifs rangés par FAMILLE, dans l'ordre du soin.
 *
 *  Un cabinet qui pose le catalogue se retrouve avec une cinquantaine de
 *  motifs. En liste plate, trouver « Couronne — 2e séance » demande de
 *  parcourir l'écran entier ; rangées par famille, les trois séances de la
 *  couronne se suivent, sous la couleur qu'elles partagent.
 *
 *  Ce que le praticien a créé lui-même, qui n'a pas de famille, ferme la
 *  marche. Un cabinet qui n'a jamais rangé ses motifs n'a qu'un seul groupe,
 *  sans titre : son écran ne change pas. */
export function grouperParFamille<T extends { categorie?: string | null }>(
  types: T[],
): [string, T[]][] {
  const par = new Map<string, T[]>()
  for (const t of types) {
    const famille = (t.categorie ?? '').trim()
    if (!par.has(famille)) par.set(famille, [])
    par.get(famille)!.push(t)
  }
  return Array.from(par.keys())
    .sort((a, b) => rangFamille(a) - rangFamille(b))
    .map((famille) => [famille, par.get(famille)!] as [string, T[]])
}

function rangFamille(nom: string): number {
  if (!nom) return 999 // sans famille : en dernier
  const i = MOTIFS_DENTAIRES.findIndex((f) => f.nom === nom)
  return i === -1 ? 900 : i // une famille inventée par le cabinet passe après le catalogue
}

/** Ce motif peut-il être posé en rendez-vous PAR LE CABINET ?
 *
 *  À ne pas confondre avec `rdv`, qui dit si le PATIENT peut le réserver en
 *  ligne. Le cabinet pose tout, sauf les lignes purement comptables du
 *  catalogue d'actes (v86) : un composite se facture, il ne se réserve pas. */
export function posableAuCabinet(
  t: { acte?: boolean | null; rdv?: boolean | null },
): boolean {
  return t.acte !== true || t.rdv === true
}

// ── CE QU'UN MOTIF LAISSE PRÉVOIR ───────────────────────────────────────────
//
// Le motif du rendez-vous dit déjà beaucoup de la séance : un détartrage
// finit presque toujours en D708 sur la feuille de soins, et consomme les
// mêmes gants, le même gobelet, la même pâte à polir. Le logiciel le sait au
// moment où le patient s'assoit ; il n'a aucune raison de faire chercher
// l'acte dans six familles, ni de faire retaper le consommable.
//
// Deux lectures, du plus sûr au moins sûr :
//
//   1. le motif est un de ceux du catalogue → ce que le catalogue en dit ;
//   2. le motif a été créé par le cabinet (« Composite 2 faces », « Contrôle
//      enfant ») → on le reconnaît à ses mots.
//
// La seconde est une approximation, et elle ne sert qu'à PROPOSER. Rien de ce
// qui sort d'ici n'est écrit sur une feuille ou retiré d'une étagère sans que
// le praticien l'ait validé.

/** Les mots qui trahissent un soin, pour les motifs que le cabinet a nommés
 *  lui-même. L'ordre compte : la première règle qui reconnaît le motif gagne,
 *  et « extraction dent de sagesse » doit tomber sur la sagesse avant
 *  l'extraction simple. */
const INDICES: { mots: string[]; famille: string; actes: string[] }[] = [
  { mots: ['sagesse'],                                   famille: 'Chirurgie et implantologie', actes: ['D720', 'D725'] },
  { mots: ['extraction', 'avulsion'],                    famille: 'Chirurgie et implantologie', actes: ['D713', 'D714'] },
  { mots: ['implant', 'chirurgie', 'suture'],            famille: 'Chirurgie et implantologie', actes: [] },
  { mots: ['detartrage'],                                famille: 'Prévention',                 actes: ['D708'] },
  { mots: ['fluor', 'sillon'],                           famille: 'Prévention',                 actes: ['D719'] },
  { mots: ['surfacage', 'parodont', 'gingiv'],           famille: 'Parodontologie',             actes: ['D710'] },
  { mots: ['devitalis', 'pulpectomie', 'endodon', 'canalaire', 'canal'], famille: 'Endodontie', actes: ['D704', 'D705', 'D706'] },
  { mots: ['coiffage'],                                  famille: 'Endodontie',                 actes: ['D707'] },
  { mots: ['composite', 'obturation', 'carie', 'plombage', 'amalgame'], famille: 'Soins conservateurs', actes: ['D700', 'D701', 'D702'] },
  { mots: ['bridge'],                                    famille: 'Prothèse et esthétique',     actes: ['D756'] },
  { mots: ['couronne'],                                  famille: 'Prothèse et esthétique',     actes: ['D754'] },
  { mots: ['facette'],                                   famille: 'Prothèse et esthétique',     actes: ['D760'] },
  { mots: ['rebasage'],                                  famille: 'Prothèse et esthétique',     actes: ['D751'] },
  { mots: ['prothese', 'empreinte', 'essayage', 'blanchiment', 'inlay', 'onlay'], famille: 'Prothèse et esthétique', actes: [] },
  { mots: ['orthodon', 'odf', 'bague', 'appareil', 'contention'], famille: 'Orthodontie',       actes: ['D626'] },
  { mots: ['urgence', 'douleur'],                        famille: 'Consultation et urgence',    actes: ['C', 'D716'] },
  { mots: ['consultation', 'controle', 'bilan', 'visite'], famille: 'Consultation et urgence',  actes: ['C'] },
]

/** Le motif du catalogue qui porte ce libellé, avec sa famille. */
function motifDuCatalogue(nom: string): { famille: FamilleMotifs; motif: MotifPret } | null {
  const c = cle(nom)
  for (const famille of MOTIFS_DENTAIRES) {
    const motif = famille.motifs.find((m) => cle(m.nom) === c)
    if (motif) return { famille, motif }
  }
  return null
}

function indiceDuMotif(nom: string) {
  const c = cle(nom)
  return INDICES.find((r) => r.mots.some((m) => c.includes(m))) ?? null
}

/** Les actes à PROPOSER sur la feuille de soins de ce rendez-vous.
 *
 *  Un motif du catalogue sans acte (`actes` absent) ne propose rien, et c'est
 *  voulu : on ne retombe pas sur les mots de son libellé pour lui en trouver
 *  un. « Couronne — 2e séance : essayage » contient « couronne », et
 *  proposer D754 à l'essayage ferait coter la couronne avant qu'elle soit
 *  posée. */
export function actesSuggeres(nomMotif: string | null | undefined): ActeDentaire[] {
  const nom = (nomMotif ?? '').trim()
  if (!nom) return []
  const connu = motifDuCatalogue(nom)
  const codes = connu ? (connu.motif.actes ?? []) : (indiceDuMotif(nom)?.actes ?? [])
  return codes
    .map((code) => acteParCode(code))
    .filter((a): a is ActeDentaire => a !== null)
}

/** La famille de soin d'un motif, même s'il n'est pas du catalogue. */
export function familleDuMotif(nomMotif: string | null | undefined): string | null {
  const nom = (nomMotif ?? '').trim()
  if (!nom) return null
  return motifDuCatalogue(nom)?.famille.nom ?? indiceDuMotif(nom)?.famille ?? null
}

// ── LE STOCK QU'UNE FAMILLE DE SOIN CONSOMME ────────────────────────────────
//
// Aucun article n'est livré avec MonRDV (voir lib/stock.ts) : chaque cabinet
// nomme les siens, et « Septanest 1/100 000 » ne dit pas au logiciel qu'il
// s'agit d'un anesthésique. Ce qui se sait, en revanche, c'est la CATÉGORIE où
// le praticien l'a rangé. On propose donc, pour une famille de soin, les
// articles des rayons où elle puise.
//
// Ce n'est qu'un repli, pour la PREMIÈRE fois qu'un motif est clôturé. Dès la
// seconde, le cabinet a dit ce qu'il utilise vraiment, et c'est cette liste-là
// qui revient (migration v99).
const RAYONS_PAR_FAMILLE: Record<string, string[]> = {
  'Consultation et urgence':    ['Consommables'],
  'Prévention':                 ['Consommables', 'Hygiène et stérilisation'],
  'Soins conservateurs':        ['Anesthésie', 'Restauration et composites', 'Consommables'],
  'Endodontie':                 ['Anesthésie', 'Endodontie', 'Consommables'],
  'Parodontologie':             ['Anesthésie', 'Consommables'],
  'Chirurgie et implantologie': ['Anesthésie', 'Chirurgie et sutures', 'Consommables'],
  'Prothèse et esthétique':     ['Anesthésie', 'Empreintes et prothèse', 'Consommables'],
  'Orthodontie':                ['Empreintes et prothèse', 'Consommables'],
}

/** Les rayons du stock où ce motif puise, du plus spécifique au plus banal. */
export function rayonsDuMotif(nomMotif: string | null | undefined): string[] {
  const famille = familleDuMotif(nomMotif)
  return famille ? (RAYONS_PAR_FAMILLE[famille] ?? []) : []
}
