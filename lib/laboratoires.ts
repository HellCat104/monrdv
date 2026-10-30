// L'ANNUAIRE DES LABORATOIRES — ce qui est partagé entre l'écran et les routes.
//
// Le travail de prothèse se suit par TÉLÉPHONE : on appelle pour savoir où en
// est une couronne. L'annuaire existe pour que ce numéro soit à un clic du
// travail en retard, pas dans un carnet posé à côté du fauteuil.
//
// Il se remplit tout seul : enregistrer un travail avec un nom inconnu y crée
// l'entrée. C'est délibéré — un annuaire qu'il faut peupler avant de pouvoir
// s'en servir reste vide, et c'est exactement ce qui est arrivé au carnet de
// suggestions qu'il remplace.

export interface Laboratoire {
  id: string
  nom: string
  telephone?: string | null
  contact?: string | null
  email?: string | null
  adresse?: string | null
  delai_jours?: number | null
  notes?: string | null
  actif?: boolean
}

/** La v93 n'est pas passée : des CODES d'erreur seulement, jamais le texte du
 *  message — la leçon du stock, où chercher le nom de la table faisait passer
 *  tout refus légitime pour une base en retard. */
export function tableLaboAbsente(error: { code?: string } | null): boolean {
  if (!error) return false
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
}

export const LABO_NON_ACTIVE = 'L’annuaire attend une migration de la base (v93).'

export function labosActifs(liste: Laboratoire[]): Laboratoire[] {
  return liste.filter((l) => l.actif !== false)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

/** Le laboratoire d'un travail, retrouvé par son identifiant et, à défaut, par
 *  le nom recopié — les travaux d'avant la v93 n'ont que celui-là. */
export function laboDuTravail(
  liste: Laboratoire[],
  laboratoireId?: string | null,
  nomRecopie?: string | null,
): Laboratoire | null {
  if (laboratoireId) {
    const trouve = liste.find((l) => l.id === laboratoireId)
    if (trouve) return trouve
  }
  const n = (nomRecopie ?? '').trim().toLowerCase()
  if (!n) return null
  return liste.find((l) => l.nom.trim().toLowerCase() === n) ?? null
}

/** La date de retour à proposer, d'après le délai habituel du laboratoire.
 *  Rien n'est proposé quand le délai est inconnu : une date inventée serait
 *  pire que pas de date, parce qu'elle déclencherait une alerte de retard. */
export function retourPropose(labo: Laboratoire | null, aujourdhui: string): string | null {
  if (!labo || labo.delai_jours == null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aujourdhui)) return null
  const [y, m, d] = aujourdhui.split('-').map(Number)
  const t = new Date(y, m - 1, d + Number(labo.delai_jours))
  const mm = String(t.getMonth() + 1).padStart(2, '0')
  const dd = String(t.getDate()).padStart(2, '0')
  return `${t.getFullYear()}-${mm}-${dd}`
}
