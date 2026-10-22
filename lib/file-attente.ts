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
import { minutesDepuis } from '@/lib/utils'

export interface EtatPatient {
  label: string
  /** Classes Tailwind de la pastille. */
  couleur: string
}

interface LigneFile {
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
    case 'arrive':
      return {
        // « Attend depuis » plutôt que « Arrivé » : c'est la durée qui fait
        // agir, et elle répond à la question que le patient pose au comptoir.
        label: minutesDepuis(a.queue_arrived_at) == null
          ? 'En salle d’attente'
          : `Attend depuis ${minutesDepuis(a.queue_arrived_at)} min`,
        couleur: 'bg-blue-100 text-blue-700',
      }
    case 'en_consultation':
      return { label: `En consultation${duree(a.queue_started_at)}`, couleur: 'bg-green-100 text-green-700' }
    case 'parti':
      return { label: 'Terminé', couleur: 'bg-gray-100 text-gray-600' }
  }

  // Pas de file ce jour-là : seule la présence peut encore dire quelque chose.
  if (a.attendance === 'absent') return { label: 'Absent', couleur: 'bg-red-100 text-red-700' }
  if (a.attendance === 'late') return { label: 'En retard', couleur: 'bg-orange-100 text-orange-700' }
  if (a.attendance === 'present') return { label: 'Présent', couleur: 'bg-green-100 text-green-700' }
  return null
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
