// Où en est ce patient — UNE seule phrase, lue pareil par les deux comptes.
//
// Avant, la ligne portait deux étiquettes pour un même fait : la secrétaire
// pointe « arrivé », MonRDV écrivait `queue_status = arrive` ET
// `attendance = present`, et l'écran affichait « Présent » À CÔTÉ de « Attend
// depuis 12 min ». Pire : « Présent » survit à la consultation quand « Attend
// depuis » disparaît — le même mot voulait donc dire « il patiente » le matin
// et « il est venu » le soir.
//
// La file (`queue_status`) raconte le MOMENT : il attend, il est avec le
// médecin, il est reparti. La présence (`attendance`) raconte le BILAN du
// rendez-vous : venu, absent, en retard — c'est elle qui alimente les
// statistiques. Quand la file a quelque chose à dire, elle parle ; la présence
// ne reprend la parole que pour ce qu'elle seule sait : une absence, un retard.
import { minutesDepuis, getNowInMaroc } from '@/lib/utils'

/** Au-delà de ce retard, on considère que le patient est en retard. Dix
 *  minutes : en deçà, c'est la vie d'un cabinet, pas un retard, et l'annoncer
 *  ferait passer tout le monde pour fautif. */
export const RETARD_TOLERANCE_MIN = 10

/** Les minutes de retard d'un patient qu'on attend ENCORE, ou null.
 *
 *  Calculé depuis l'heure du rendez-vous : personne n'a à cliquer quoi que ce
 *  soit pour qu'un retard se voie. Le bouton « En retard » demandait à la
 *  secrétaire de constater à la main ce que l'horloge sait déjà — et comme
 *  elle a autre chose à faire, le compteur des retards restait à zéro. */
export function retardMinutes(
  a: { date?: string | null; time?: string | null; queue_status?: string | null },
  maintenant: Date,
): number | null {
  // Il est arrivé : son retard, s'il y en avait un, appartient au passé et
  // c'est le serveur qui l'a inscrit au pointage.
  if (a.queue_status || !a.date || !a.time) return null
  const [an, mois, jour] = String(a.date).split('-').map(Number)
  const [heure, minute] = String(a.time).substring(0, 5).split(':').map(Number)
  if ([an, mois, jour, heure, minute].some((n) => !Number.isFinite(n))) return null
  // Uniquement AUJOURD'HUI. Un rendez-vous de la semaine dernière jamais
  // pointé n'est pas « en retard de 10 080 minutes » : il est passé, et c'est
  // une absence, pas un retard.
  const memeJour = maintenant.getFullYear() === an
    && maintenant.getMonth() + 1 === mois
    && maintenant.getDate() === jour
  if (!memeJour) return null
  const prevu = new Date(an, mois - 1, jour, heure, minute)
  const ecart = Math.floor((maintenant.getTime() - prevu.getTime()) / 60000)
  return ecart > RETARD_TOLERANCE_MIN ? ecart : null
}

export interface EtatPatient {
  label: string
  /** Classes Tailwind de la pastille. */
  couleur: string
}

interface LigneFile {
  date?: string | null
  time?: string | null
  queue_status?: string | null
  queue_arrived_at?: string | null
  queue_started_at?: string | null
  attendance?: string | null
}

export function etatPatient(a: LigneFile): EtatPatient | null {
  const duree = (iso?: string | null) => {
    const m = minutesDepuis(iso)
    return m == null ? '' : ` · ${m} min`
  }

  switch (a.queue_status) {
    case 'arrive': {
      // « Attend depuis » plutôt que « Arrivé » : c'est la durée qui fait
      // agir, et elle répond à la question que le patient pose au comptoir.
      const base = minutesDepuis(a.queue_arrived_at) == null
        ? 'En salle d’attente'
        : `Attend depuis ${minutesDepuis(a.queue_arrived_at)} min`
      // Un retard noté AVANT l'arrivée restait invisible une fois le patient
      // pointé : la file ayant la priorité, l'information existait en base et
      // nulle part à l'écran. On la dit.
      return a.attendance === 'late'
        ? { label: `${base} · en retard`, couleur: 'bg-orange-100 text-orange-700' }
        : { label: base, couleur: 'bg-blue-100 text-blue-700' }
    }
    case 'en_consultation':
      return { label: `En consultation${duree(a.queue_started_at)}`, couleur: 'bg-green-100 text-green-700' }
    case 'parti':
      return { label: 'Terminé', couleur: 'bg-gray-100 text-gray-600' }
  }

  // Pas de file ce jour-là : seule la présence peut encore dire quelque chose.
  if (a.attendance === 'absent') return { label: 'Absent', couleur: 'bg-red-100 text-red-700' }

  // Le retard s'affiche SEUL, sans que personne l'ait coché : l'heure du
  // rendez-vous et l'horloge suffisent. Avant, il fallait que la secrétaire
  // pense à cliquer au bon moment — elle avait un patient devant elle.
  const retard = retardMinutes(a, getNowInMaroc())
  if (retard != null) return { label: `En retard de ${retard} min`, couleur: 'bg-orange-100 text-orange-700' }
  if (a.attendance === 'late') return { label: 'En retard', couleur: 'bg-orange-100 text-orange-700' }
  if (a.attendance === 'present') return { label: 'Présent', couleur: 'bg-green-100 text-green-700' }
  return null
}

/** Le patient n'est pas venu — et on en est sûr.
 *
 *  « Absent » seul ne suffit pas : il a pu être coché par erreur sur quelqu'un
 *  qui était dans la salle. Dès qu'une file le concerne, il est venu, et la
 *  vue Semaine n'a pas à le barrer pendant que la vue Jour annonce « attend
 *  depuis 12 min ». Trois écrans qui racontent trois choses du même rendez-vous,
 *  c'est le médecin qui cesse de croire l'application. */
export function estAbsent(a: LigneFile): boolean {
  return a.attendance === 'absent' && !a.queue_status
}

/** Le patient est venu : il est passé par la file, ou son bilan le dit. */
export function estVenu(a: LigneFile): boolean {
  return !!a.queue_status || a.attendance === 'present' || a.attendance === 'late'
}

/** Ce qui attend un geste de l'autre poste, résumé en une ligne qu'on LIT.
 *  Le geste, lui, se fait dans le panneau au bout de la ligne — une pastille
 *  qui se clique et une pastille qui s'affiche, c'est la confusion garantie. */
export function resumeEchange(a: {
  mots?: { auteur: string; auteur_nom?: string | null; contenu: string }[] | null
  reprogrammer_jours?: number | null
}): string | null {
  const morceaux: string[] = []
  const dernier = a.mots && a.mots.length > 0 ? a.mots[a.mots.length - 1] : null
  if (dernier) {
    const qui = dernier.auteur === 'medecin' ? 'Dr' : (dernier.auteur_nom?.split(' ')[0] || 'Accueil')
    morceaux.push(`${qui} : ${dernier.contenu}`)
  }
  if (a.reprogrammer_jours != null) morceaux.push(`à revoir dans ${a.reprogrammer_jours} j`)
  return morceaux.length > 0 ? morceaux.join(' · ') : null
}
