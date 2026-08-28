'use client'

// Vue Mois : une case par jour, listant ce qui s'y passe. Un simple compteur
// « n RDV » disait le volume mais rien du contenu, et surtout ne montrait pas
// les fermetures — or c'est en vue Mois qu'on planifie ses congés.

import { format, isSameMonth, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getNowInMaroc } from '@/lib/utils'
import type { Appointment } from '@/types'
import type { WeekBlock } from './WeekGrid'

interface MonthGridProps {
  days: Date[]                    // 42 jours, lundi → dimanche
  month: Date                     // mois de référence (pour griser les jours voisins)
  appointments: Appointment[]
  blocks: WeekBlock[]
  onSelectDay: (day: Date) => void
  onSelectAppointment: (apt: Appointment) => void
}

const MAX_VISIBLE = 3             // au-delà, on résume par « + n autres »

export function MonthGrid({
  days, month, appointments, blocks, onSelectDay, onSelectAppointment,
}: MonthGridProps) {
  const aujourdhui = getNowInMaroc()

  // Regroupement par date, fait une fois plutôt qu'à chaque case
  const rdvParJour = new Map<string, Appointment[]>()
  for (const a of appointments) {
    if (a.status === 'cancelled') continue
    const l = rdvParJour.get(a.date) ?? []
    l.push(a)
    rdvParJour.set(a.date, l)
  }
  rdvParJour.forEach((l) => l.sort((a, b) => a.time.localeCompare(b.time)))

  const blocsParJour = new Map<string, WeekBlock[]>()
  for (const b of blocks) {
    const l = blocsParJour.get(b.date) ?? []
    l.push(b)
    blocsParJour.set(b.date, l)
  }

  return (
    <div>
      {/* Jours de la semaine */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 pb-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-gray-100">
        {days.map((day) => {
          const dStr = format(day, 'yyyy-MM-dd')
          const dansLeMois = isSameMonth(day, month)
          const estAujourdhui = isSameDay(day, aujourdhui)

          const rdv = rdvParJour.get(dStr) ?? []
          const blocs = blocsParJour.get(dStr) ?? []
          const conges = blocs.filter((b) => !b.start_time)
          const plages = blocs.filter((b) => b.start_time)
          const ferme = conges.length > 0

          // Blocages et rendez-vous mélangés, dans l'ordre de la journée :
          // c'est ainsi qu'on lit un agenda.
          const lignes: { cle: string; heure: string; couleur: string; texte: string; barre?: boolean; apt?: Appointment }[] = [
            ...plages.map((b) => ({
              cle: b.id,
              heure: b.start_time!.slice(0, 5),
              couleur: 'bg-red-500',
              texte: `${b.start_time!.slice(0, 5)} ${b.reason || 'Bloqué'}`,
            })),
            ...rdv.map((a) => ({
              cle: a.id,
              heure: a.time.substring(0, 5),
              couleur: a.attendance === 'absent' ? 'bg-gray-400'
                     : a.status === 'pending' ? 'bg-amber-400'
                     : 'bg-primary-500',
              texte: `${a.time.substring(0, 5)} ${a.patient?.first_name ?? ''} ${a.patient?.last_name ?? ''}`.trim(),
              barre: a.attendance === 'absent',
              apt: a,
            })),
          ].sort((x, z) => x.heure.localeCompare(z.heure))
          const visibles = lignes.slice(0, MAX_VISIBLE)
          const reste = lignes.length - visibles.length

          return (
            <div
              key={dStr}
              onClick={() => onSelectDay(day)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelectDay(day) }}
              className={`min-h-[104px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors ${
                ferme ? 'bg-red-50/70 hover:bg-red-50'
                      : dansLeMois ? 'bg-white hover:bg-gray-50'
                                   : 'bg-gray-50/60 hover:bg-gray-100/60'
              }`}
              title={ferme ? (conges[0].reason || 'Journée fermée') : undefined}
            >
              {/* Numéro du jour, en haut à droite */}
              <div className="flex justify-end mb-1">
                <span className={`text-sm leading-none ${
                  estAujourdhui
                    ? 'text-white bg-primary-500 rounded-full w-6 h-6 flex items-center justify-center font-semibold'
                    : dansLeMois ? 'text-gray-700 py-1' : 'text-gray-300 py-1'
                }`}>
                  {format(day, 'd')}
                </span>
              </div>

              {/* Journée fermée : on le dit, et on n'encombre pas la case */}
              {ferme ? (
                <div className="text-[9px] sm:text-[11px] font-medium text-red-700 truncate leading-tight">
                  Fermé<span className="hidden sm:inline">{conges[0].reason ? ` · ${conges[0].reason}` : ''}</span>
                </div>
              ) : (
                <>
                {/* Écran étroit : une case fait ~50 px, le texte y serait
                    tronqué à « 09… ». On ne garde que les pastilles. */}
                <div className="flex flex-wrap gap-1 sm:hidden">
                  {lignes.slice(0, 4).map((l) => (
                    <span key={l.cle} className={`w-1.5 h-1.5 rounded-full ${l.couleur}`} />
                  ))}
                </div>

                <div className="hidden sm:block space-y-0.5">
                  {visibles.map((l) => (
                    <div
                      key={l.cle}
                      onClick={(e) => { if (l.apt) { e.stopPropagation(); onSelectAppointment(l.apt) } }}
                      className="flex items-center gap-1 text-[11px] leading-tight"
                      title={l.texte}
                    >
                      <span className={`w-1 h-3 rounded-full shrink-0 ${l.couleur}`} />
                      <span className={`truncate ${l.barre ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {l.texte}
                      </span>
                    </div>
                  ))}
                  {reste > 0 && (
                    <div className="text-[11px] text-gray-400 pl-2">+ {reste} autre{reste > 1 ? 's' : ''}</div>
                  )}
                </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Cliquez sur un jour pour voir le détail
      </p>
    </div>
  )
}
