// Feuilles de soins — règles partagées entre l'écran, les routes et le document.
//
// Une feuille de soins décrit des actes FAITS, pour que le patient se fasse
// rembourser. Elle ne crée aucune recette (voir l'en-tête de la migration v65),
// et les codes de nomenclature viennent du praticien, jamais du logiciel.
export const STATUTS_FEUILLE = ['etablie', 'remise', 'remboursee'] as const
export type StatutFeuille = (typeof STATUTS_FEUILLE)[number]

export const STATUT_FEUILLE_LABELS: Record<StatutFeuille, string> = {
  etablie: 'Établie',
  remise: 'Remise au patient',
  remboursee: 'Remboursée',
}

export interface LigneFeuille {
  id?: string
  tooth: string | null
  code: string | null
  label: string
  amount: number
  position?: number
}

/** Montant d'une feuille : la somme de ses lignes, jamais un total saisi à
 *  part — un total qui ne correspond pas au détail fait rejeter le dossier. */
export function totalFeuille(lignes: { amount: number | string }[]): number {
  return lignes.reduce((t, l) => t + (Number(l.amount) || 0), 0)
}

/** Nettoie une ligne venue du navigateur. Une ligne sans libellé n'existe pas. */
export function normaliserLigne(brut: unknown, position: number): LigneFeuille | null {
  if (!brut || typeof brut !== 'object') return null
  const l = brut as Record<string, unknown>
  const label = String(l.label ?? '').trim().slice(0, 160)
  if (!label) return null
  const montant = Number(String(l.amount ?? '0').replace(',', '.'))
  return {
    tooth: l.tooth ? String(l.tooth).trim().slice(0, 4) : null,
    code: l.code ? String(l.code).trim().toUpperCase().slice(0, 20) : null,
    label,
    amount: Number.isFinite(montant) && montant >= 0 ? Math.round(montant * 100) / 100 : 0,
    position,
  }
}

/** Champs de l'assuré venus du navigateur : on garde des paires texte courtes,
 *  on jette le reste. La liste des clés attendues vit dans lib/organismes.ts,
 *  mais la base ne doit rien avaler d'autre que du texte. */
export function nettoyerDonneesAssure(brut: unknown): Record<string, string> {
  if (!brut || typeof brut !== 'object') return {}
  const sortie: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (!/^[a-z_]{1,32}$/.test(cle)) continue
    const texte = String(valeur ?? '').trim().slice(0, 120)
    if (texte) sortie[cle] = texte
  }
  return sortie
}


// ════════════════════════════════════════════════════════════════════════════
// LE SUIVI DU REMBOURSEMENT (v90)
// ════════════════════════════════════════════════════════════════════════════
//
// La seule question qu'on se pose devant une feuille partie : DEPUIS QUAND
// attend-elle ? Huit semaines sans retour, c'est un dossier à relancer ;
// avant-hier, cela ne regarde personne. Tout ce qui suit sert à distinguer
// les deux, et rien d'autre.
//
// L'argent va de l'organisme AU PATIENT, qui a déjà réglé le cabinet. Rien
// d'ici n'entre dans un total de recettes.

/** Au-delà de ce délai, un dossier déposé mérite qu'on s'en inquiète. Deux
 *  mois : c'est le temps qu'un remboursement met couramment au Maroc, et
 *  alerter plus tôt ne ferait qu'apprendre à ignorer l'alerte. */
export const JOURS_SANS_RETOUR = 60

export interface FeuilleSuivi {
  id: string
  care_date: string
  status: StatutFeuille
  total: number | string
  insurer?: string | null
  remise_le?: string | null
  rembourse_le?: string | null
  montant_rembourse?: number | string | null
  patient?: { first_name?: string | null; last_name?: string | null } | null
}

/** Le jour à partir duquel on compte l'attente, et s'il est CERTAIN.
 *
 *  Une feuille établie avant la v90 n'a pas de date de remise. On ne l'invente
 *  pas : on se rabat sur la date des soins, qui est une borne sûre — une
 *  feuille ne peut pas être partie avant que les soins aient eu lieu. L'écran
 *  dit alors « au plus tôt le… » plutôt que d'afficher un jour faux. */
export function departAttente(f: FeuilleSuivi): { jour: string; estime: boolean } {
  const remise = (f.remise_le ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(remise)) return { jour: remise, estime: false }
  return { jour: (f.care_date ?? '').slice(0, 10), estime: true }
}

/** Jours écoulés entre deux « AAAA-MM-JJ ».
 *
 *  Comparaison de composantes, jamais de Date sérialisée : une date de
 *  calendrier passée par toISOString() recule d'un jour dès que le navigateur
 *  n'est pas au Maroc. */
export function joursEcoules(depuis: string, jusqua: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depuis) || !/^\d{4}-\d{2}-\d{2}$/.test(jusqua)) return 0
  const [ya, ma, da] = depuis.split('-').map(Number)
  const [yb, mb, db] = jusqua.split('-').map(Number)
  const a = Date.UTC(ya, ma - 1, da)
  const b = Date.UTC(yb, mb - 1, db)
  return Math.max(0, Math.round((b - a) / 86400000))
}

/** Un dossier parti et jamais revenu depuis trop longtemps. */
export function enSouffrance(f: FeuilleSuivi, aujourdhui: string, jours = JOURS_SANS_RETOUR): boolean {
  if (f.status !== 'remise') return false
  return joursEcoules(departAttente(f).jour, aujourdhui) >= jours
}

/** Établie et jamais remise : le document existe et dort dans le logiciel.
 *  C'est le cas le plus bête et le plus fréquent — il suffit de l'imprimer. */
export function jamaisRemise(f: FeuilleSuivi, aujourdhui: string, jours = 7): boolean {
  if (f.status !== 'etablie') return false
  return joursEcoules((f.care_date ?? '').slice(0, 10), aujourdhui) >= jours
}

/** Ce qui est resté à la charge du patient. `null` tant que le montant
 *  remboursé n'est pas connu : afficher le total comme reste à charge
 *  laisserait croire que l'organisme n'a rien versé. */
export function resteACharge(f: FeuilleSuivi): number | null {
  if (f.montant_rembourse === null || f.montant_rembourse === undefined || f.montant_rembourse === '') return null
  const verse = Number(f.montant_rembourse)
  if (!Number.isFinite(verse)) return null
  return Math.round((Number(f.total) - verse) * 100) / 100
}

export interface BilanFeuilles {
  aRemettre: FeuilleSuivi[]
  enAttente: FeuilleSuivi[]
  souffrance: FeuilleSuivi[]
  /** Montant des feuilles parties et pas encore revenues. Ce n'est PAS une
   *  créance du cabinet : c'est ce que ses patients attendent. */
  montantEnAttente: number
  rien: boolean
}

export function bilanFeuilles(feuilles: FeuilleSuivi[], aujourdhui: string): BilanFeuilles {
  const aRemettre = feuilles.filter((f) => jamaisRemise(f, aujourdhui))
  const enAttente = feuilles.filter((f) => f.status === 'remise')
  const souffrance = enAttente.filter((f) => enSouffrance(f, aujourdhui))
  const montantEnAttente = enAttente.reduce((t, f) => t + (Number(f.total) || 0), 0)
  return {
    aRemettre, enAttente, souffrance,
    montantEnAttente: Math.round(montantEnAttente * 100) / 100,
    rien: aRemettre.length === 0 && souffrance.length === 0,
  }
}

export function nomPatient(f: FeuilleSuivi): string {
  const p = f.patient
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Patient'
}
