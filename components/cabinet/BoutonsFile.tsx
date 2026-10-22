'use client'

// Le pointage du patient — UN seul jeu de boutons, pour les deux écrans de la
// secrétaire.
//
// Avant, l'Agenda portait « Présent / En retard / Absent » et la Salle
// d'attente « Arrivé / En consultation / Parti ». Deux vocabulaires, et un
// chevauchement traître : « Arrivé » marque aussi présent, mais « Présent » ne
// marque pas arrivé. Cliquer ✓ sur l'Agenda ne faisait donc PAS apparaître le
// patient dans la salle d'attente du médecin — même geste apparent, résultat
// différent, et rien à l'écran ne le disait.
//
// Le circuit dit le MOMENT (il attend, il est avec le médecin, il est reparti).
// Les deux boutons de droite disent ce que le circuit ne sait pas dire : un
// patient qui n'est jamais venu, un patient en retard. Ils comptent dans les
// statistiques de présence, pas le circuit.
import { LogIn, Stethoscope, LogOut, RotateCcw, Clock, UserX } from 'lucide-react'

export const CIRCUIT: { key: string; label: string; icon: typeof LogIn }[] = [
  { key: 'arrive',          label: 'Arrivé',          icon: LogIn },
  { key: 'en_consultation', label: 'En consultation', icon: Stethoscope },
  { key: 'parti',           label: 'Parti',           icon: LogOut },
]

const EXCEPTIONS: { key: string; label: string; icon: typeof Clock }[] = [
  { key: 'late',   label: 'En retard', icon: Clock },
  { key: 'absent', label: 'Absent',    icon: UserX },
]

export default function BoutonsFile({
  queueStatus, attendance, onQueue, onAttendance, libelles = false, reduit = false,
}: {
  queueStatus?: string | null
  attendance?: string | null
  onQueue: (key: string | null) => void
  onAttendance: (key: string | null) => void
  /** Afficher le texte à côté de l'icône (vrai sur la salle d'attente, qui a
   *  de la place ; faux sur l'agenda, dont la ligne porte déjà beaucoup). */
  libelles?: boolean
  /** Version courte, pour l'AGENDA : « Arrivé » et « En retard », rien de
   *  plus. Faire avancer quelqu'un dans le circuit ou le marquer parti se
   *  fait au poste d'accueil, pas dans la vue d'ensemble — l'agenda y
   *  gagnait cinq icônes par ligne que personne n'y cliquait.
   *
   *  Le retour en arrière, lui, reste présent même en version réduite : sans
   *  lui, un « Arrivé » cliqué par erreur sur l'agenda n'avait plus AUCUN
   *  chemin de retour, et verrouillait au passage « Déplacer » et
   *  « Annuler » sur cette ligne. */
  reduit?: boolean
}) {
  const circuit = reduit ? CIRCUIT.filter((e) => e.key === 'arrive') : CIRCUIT
  const exceptions = reduit ? EXCEPTIONS.filter((e) => e.key === 'late') : EXCEPTIONS

  return (
    <div className="flex items-center gap-1">
      {circuit.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onQueue(key)}
          disabled={queueStatus === key}
          title={label}
          className={`flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg border transition ${
            queueStatus === key
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {libelles && <span className="hidden sm:inline">{label}</span>}
        </button>
      ))}

      {queueStatus && (
        <button onClick={() => onQueue(null)} title="Réinitialiser le pointage" className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Séparés par un filet : ce ne sont pas des étapes du circuit, ce sont
          deux cas de figure qui l'interrompent. */}
      <span className="w-px h-5 bg-gray-200 mx-0.5" />

      {exceptions.map(({ key, label, icon: Icon }) => {
        // « Absent » et « il est là » ne peuvent pas être vrais ensemble. Le
        // bouton restait pourtant cliquable sur un patient assis dans la
        // salle : l'écran affichait « Attend depuis 12 min » et les
        // statistiques comptaient une absence pour une consultation faite.
        //
        // « En retard » reste proposé : un patient PEUT arriver en retard, et
        // c'est même le seul moment où on le constate.
        const impossible = key === 'absent' && !!queueStatus
        if (impossible) return null
        return (
          <button
            key={key}
            onClick={() => onAttendance(attendance === key ? null : key)}
            title={label}
            className={`p-1.5 rounded-lg border text-xs transition ${
              attendance === key
                ? (key === 'absent' ? 'bg-red-100 text-red-700 border-transparent' : 'bg-orange-100 text-orange-700 border-transparent')
                : 'border-gray-200 text-gray-400 hover:bg-gray-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
