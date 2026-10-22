'use client'

// File d'attente du jour : la secrétaire fait avancer chaque patient
// dans le circuit Arrivé → En consultation → Parti.
import { useCallback, useEffect, useState } from 'react'
import { getNowInMaroc, formatTime, minutesDepuis, APPEL_VALIDE_MIN } from '@/lib/utils'
import { etatPatient } from '@/lib/file-attente'
import BoutonsFile from '@/components/cabinet/BoutonsFile'
import { format } from 'date-fns'
import { Armchair, BellRing, ChevronDown } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>

export default function WaitingRoomClient() {
  const [appts, setAppts] = useState<Apt[]>([])
  const [loading, setLoading] = useState(true)
  const [replieOuvert, setReplieOuvert] = useState(false)
  const today = format(getNowInMaroc(), 'yyyy-MM-dd')

  const load = useCallback(async () => {
    const res = await fetch(`/api/cabinet/appointments?date=${today}`)
    if (res.ok) {
      const d = await res.json()
      setAppts((d.appointments ?? []).filter((a: Apt) => a.status !== 'cancelled'))
    }
    setLoading(false)
  }, [today])

  useEffect(() => {
    load()
    // La file bouge tout le temps : rafraîchit toutes les 60 s
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  async function patch(id: string, champs: Record<string, unknown>) {
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...champs }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error || 'Échec'); return }
    // Le select du serveur ne renvoie pas les colonnes de la v76 : sans ce
    // complément, effacer l'appel du médecin ne se voyait qu'au
    // rafraîchissement suivant, et le bandeau semblait ignorer le clic.
    const absents = Object.fromEntries(Object.entries(champs).filter(([c]) => !(c in d)))
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...d, ...absents } : a)))
  }

  const setQueue = (id: string, queue_status: string | null) => patch(id, { queue_status })

  // Le médecin réclame le patient suivant. Le bandeau existait sur l'agenda ;
  // il manquait ICI, qui est pourtant l'écran depuis lequel on fait entrer.
  const appels = appts.filter((a) => {
    const m = minutesDepuis(a.appel_suivant_le)
    return m != null && m <= APPEL_VALIDE_MIN
  })

  const waiting = appts.filter((a) => a.queue_status === 'arrive')
  const inConsult = appts.filter((a) => a.queue_status === 'en_consultation')

  // Un écran qui s'appelle « salle d'attente » doit montrer QUI EST ENCORE LÀ.
  // Il listait tous les rendez-vous du jour, y compris ceux repartis depuis
  // trois heures : quand la pièce est pleine, c'est la seule liste qu'elle
  // regarde, et elle doit tenir en cinq noms.
  //
  // Les autres ne sont pas effacés — ils se replient. Elle a encore besoin de
  // pointer quelqu'un qu'elle avait oublié, ou de corriger une erreur.
  const presents = appts.filter((a) => a.queue_status === 'arrive' || a.queue_status === 'en_consultation')
  const autres = appts.filter((a) => !presents.includes(a))
  const aAfficher = replieOuvert ? [...presents, ...autres] : presents

  return (
    <div className="space-y-4">
      {appels.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-primary-500 text-white rounded-xl px-4 py-3">
          <BellRing className="h-5 w-5 shrink-0" />
          <span className="text-sm font-semibold flex-1 min-w-0">
            Le médecin demande le patient suivant.
          </span>
          <button
            onClick={() => appels.forEach((a) => patch(a.id, { appel_suivant_le: null }))}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition"
          >
            C&apos;est fait
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Le rôle de l'écran, écrit. Deux écrans qui se ressemblent et dont
            on doit deviner la différence, c'est deux écrans qu'on ouvre au
            hasard. */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Armchair className="h-5 w-5 text-primary-500" /> Salle d&apos;attente
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Maintenant : qui est là, qui entre.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span><b className="text-blue-600">{waiting.length}</b> en attente</span>
          <span><b className="text-green-600">{inConsult.length}</b> en consultation</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : appts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">
          <Armchair className="h-8 w-8 mx-auto mb-2 opacity-40" /> Aucun rendez-vous aujourd&apos;hui.
        </div>
      ) : presents.length === 0 && !replieOuvert ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">
          <Armchair className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Personne n&apos;attend pour le moment.
          {autres.length > 0 && (
            <button onClick={() => setReplieOuvert(true)} className="block mx-auto mt-2 text-xs text-primary-600 hover:underline">
              Voir les {autres.length} rendez-vous du jour
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {aAfficher.map((a) => {
            return (
              <div key={a.id} className="flex items-center gap-3 p-3.5 flex-wrap">
                <div className="text-sm font-semibold text-gray-900 w-14 shrink-0">{formatTime(a.time)}</div>
                <div className="flex-1 min-w-[140px]">
                  <p className="font-medium text-gray-900 truncate">
                    {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{a.consultation_type?.name || a.notes || 'Consultation'}</p>
                </div>

                {/* Même phrase que sur les deux agendas (lib/file-attente) :
                    trois écrans qui nomment différemment le même état, c'est
                    trois choses à apprendre pour une seule. */}
                {etatPatient(a) && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${etatPatient(a)!.couleur}`}>
                    {etatPatient(a)!.label}
                  </span>
                )}

                <BoutonsFile
                  queueStatus={a.queue_status}
                  attendance={a.attendance}
                  onQueue={(key) => setQueue(a.id, key)}
                  onAttendance={(key) => patch(a.id, { attendance: key })}
                  libelles
                />
              </div>
            )
          })}

          {/* Le reste de la journée, replié : repartis, pas encore arrivés,
              absents. On ne les efface pas — il faut pouvoir pointer celui
              qu'on avait oublié, ou corriger une erreur. */}
          {!replieOuvert && autres.length > 0 && (
            <button
              onClick={() => setReplieOuvert(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {autres.length} autre{autres.length > 1 ? 's' : ''} rendez-vous du jour
            </button>
          )}
          {replieOuvert && (
            <button
              onClick={() => setReplieOuvert(false)}
              className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            >
              Ne montrer que la salle d&apos;attente
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400">« Arrivé » pointe automatiquement le patient comme présent dans les statistiques.</p>
    </div>
  )
}
