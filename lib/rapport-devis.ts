// LE DEVENIR DES PLANS DE TRAITEMENT — ce que les statistiques ne disaient pas.
//
// ── CE QUI MANQUAIT ─────────────────────────────────────────────────────────
//
// L'écran Statistiques compte de l'argent ENCAISSÉ et des rendez-vous honorés.
// Deux chiffres justes, et muets sur ce qui fait vivre un cabinet dentaire :
// les plans de traitement. Un devis se propose, s'accepte ou se refuse, puis
// se réalise sur des mois. Rien ne disait combien sont acceptés, ni surtout
// combien de travail accepté reste À FAIRE.
//
// ── TROIS NOMBRES, ET LEURS PIÈGES ──────────────────────────────────────────
//
// • Le TAUX D'ACCEPTATION ne se calcule que sur les devis PROPOSÉS dans la
//   période, en suivant ce qu'ils sont devenus depuis. Compter les acceptés
//   d'un mois contre les refusés du même mois mélangerait des devis proposés
//   des mois plus tôt et donnerait un taux qui n'a aucun sens.
//
// • L'ENCOURS n'est pas du chiffre d'affaires : c'est du travail vendu et pas
//   encore fait. Il n'est encaissé ni maintenant ni forcément un jour. Le
//   confondre avec une recette gonflerait la comptabilité d'un argent qui
//   n'existe pas.
//
// • Le RÉALISÉ se compte à la date où l'acte a été coché fait, pas à la date
//   du devis. Un plan signé en janvier et posé en mai est du travail de mai.
//
// Rien ici n'entre dans la caisse : l'argent réel reste les versements, qui
// ont leur propre compte (v54).

export interface LigneDevis {
  unit_price: number | string
  quantity: number | string
  done?: boolean | null
  done_at?: string | null
  label?: string | null
}

export interface DevisRapport {
  id: string
  status: string
  label?: string | null
  proposed_at?: string | null
  accepted_at?: string | null
  created_at?: string | null
  patient?: { first_name?: string | null; last_name?: string | null } | null
  items?: LigneDevis[] | null
}

export function montantLigne(l: LigneDevis): number {
  const p = Number(l.unit_price) || 0
  const q = Number(l.quantity)
  return p * (Number.isFinite(q) && q > 0 ? q : 1)
}

export function montantDevis(d: DevisRapport): number {
  return Math.round((d.items ?? []).reduce((t, l) => t + montantLigne(l), 0) * 100) / 100
}

/** Le jour d'un horodatage, sans jamais passer par toISOString() : une date
 *  sérialisée recule d'un jour dès que le lecteur n'est pas au Maroc. */
export function jourDe(ts?: string | null): string | null {
  if (!ts) return null
  const j = String(ts).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : null
}

function dansLaPeriode(jour: string | null, debut: string, fin: string): boolean {
  return !!jour && jour >= debut && jour <= fin
}

/** Au-delà de ce délai, un devis proposé et resté sans réponse mérite un
 *  appel. Trois semaines : le temps qu'un patient prend pour y réfléchir, et
 *  au-delà duquel il a souvent consulté ailleurs. */
export const JOURS_SANS_REPONSE = 21

export interface RapportDevis {
  /** Devis proposés DANS la période, et ce qu'ils sont devenus depuis. */
  proposes: number
  proposesMontant: number
  acceptes: number
  acceptesMontant: number
  refuses: number
  refusesMontant: number
  enAttente: number
  enAttenteMontant: number
  /** Part des devis tranchés qui ont été acceptés. `null` quand aucun n'a
   *  encore été tranché : afficher « 0 % » laisserait croire à un échec, alors
   *  que personne n'a encore répondu. */
  tauxAcceptation: number | null

  /** Travail accepté et pas encore réalisé, TOUTES périodes confondues : un
   *  plan signé l'an dernier et jamais posé est toujours à faire. */
  encours: number
  encoursDevis: number

  /** Actes cochés faits pendant la période, à leur date de réalisation. */
  realise: number
  realiseActes: number

  /** Proposés, sans réponse, et vieux : la liste à rappeler. */
  aRelancer: DevisRapport[]
}

export function rapportDevis(
  devis: DevisRapport[],
  debut: string,
  fin: string,
  aujourdhui: string,
): RapportDevis {
  const vivants = devis.filter((d) => d.status !== 'annule' && d.status !== 'brouillon')

  // Les devis PROPOSÉS dans la période — suivis jusqu'à aujourd'hui.
  const proposes = vivants.filter((d) => dansLaPeriode(jourDe(d.proposed_at), debut, fin))
  const acceptes = proposes.filter((d) => d.status === 'accepte' || d.status === 'termine')
  const refuses = proposes.filter((d) => d.status === 'refuse')
  const enAttente = proposes.filter((d) => d.status === 'propose')

  const somme = (liste: DevisRapport[]) =>
    Math.round(liste.reduce((t, d) => t + montantDevis(d), 0) * 100) / 100

  const tranches = acceptes.length + refuses.length

  // L'ENCOURS : sur les devis acceptés (toutes périodes), les lignes pas
  // encore cochées faites. Un devis « terminé » n'en fait plus partie, même
  // s'il reste une ligne non cochée : le praticien a dit que c'était fini.
  let encours = 0
  let encoursDevis = 0
  for (const d of vivants) {
    if (d.status !== 'accepte') continue
    const reste = (d.items ?? []).filter((l) => !l.done).reduce((t, l) => t + montantLigne(l), 0)
    if (reste > 0) { encours += reste; encoursDevis += 1 }
  }

  // Le RÉALISÉ, à la date de réalisation de chaque acte.
  let realise = 0
  let realiseActes = 0
  for (const d of vivants) {
    for (const l of d.items ?? []) {
      if (!l.done) continue
      if (!dansLaPeriode(jourDe(l.done_at), debut, fin)) continue
      realise += montantLigne(l)
      realiseActes += 1
    }
  }

  // À RELANCER : proposés, sans réponse, et assez vieux pour qu'un appel se
  // justifie. Indépendant de la période affichée — un devis oublié en mars
  // reste à rappeler quand on regarde les chiffres de juin.
  const aRelancer = vivants
    .filter((d) => d.status === 'propose')
    .filter((d) => {
      const j = jourDe(d.proposed_at)
      return !!j && joursEntre(j, aujourdhui) >= JOURS_SANS_REPONSE
    })
    .sort((a, b) => (jourDe(a.proposed_at) ?? '').localeCompare(jourDe(b.proposed_at) ?? ''))

  return {
    proposes: proposes.length,
    proposesMontant: somme(proposes),
    acceptes: acceptes.length,
    acceptesMontant: somme(acceptes),
    refuses: refuses.length,
    refusesMontant: somme(refuses),
    enAttente: enAttente.length,
    enAttenteMontant: somme(enAttente),
    tauxAcceptation: tranches > 0 ? Math.round((acceptes.length / tranches) * 100) : null,
    encours: Math.round(encours * 100) / 100,
    encoursDevis,
    realise: Math.round(realise * 100) / 100,
    realiseActes,
    aRelancer,
  }
}

export function joursEntre(depuis: string, jusqua: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depuis) || !/^\d{4}-\d{2}-\d{2}$/.test(jusqua)) return 0
  const [ya, ma, da] = depuis.split('-').map(Number)
  const [yb, mb, db] = jusqua.split('-').map(Number)
  return Math.max(0, Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000))
}

export function nomPatientDevis(d: DevisRapport): string {
  const p = d.patient
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Patient'
}
