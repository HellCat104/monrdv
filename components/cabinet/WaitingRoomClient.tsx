'use client'

// File d'attente du jour : la secrétaire fait avancer chaque patient
// dans le circuit Arrivé → En consultation → Parti.
import { useCallback, useEffect, useState } from 'react'
import { getNowInMaroc, formatTime } from '@/lib/utils'
import { format } from 'date-fns'
import { Armchair, LogIn, Stethoscope, LogOut, RotateCcw } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>

const QUEUE: { key: string; label: string; icon: typeof LogIn; chip: string }[] = [
  { key: 'arrive',          label: 'Arrivé',          icon: LogIn,       chip: 'bg-blue-100 text-blue-700' },
  { key: 'en_consultation', label: 'En consultation', icon: Stethoscope, chip: 'bg-green-100 text-green-700' },
  { key: 'parti',           label: 'Parti',           icon: LogOut,      chip: 'bg-gray-200 text-gray-600' },
]

export default function WaitingRoomClient() {
  const [appts, setAppts] = useState<Apt[]>([])
  const [loading, setLoading] = useState(true)
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

  async function setQueue(id: string, queue_status: string | null) {
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, queue_status }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error || 'Échec'); return }
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...d } : a)))
  }

  const waiting = appts.filter((a) => a.queue_status === 'arrive')
  const inConsult = appts.filter((a) => a.queue_status === 'en_consultation')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Armchair className="h-5 w-5 text-primary-500" /> Salle d&apos;attente
        </h1>
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
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {appts.map((a) => {
            const current = QUEUE.find((q) => q.key === a.queue_status)
            return (
              <div key={a.id} className="flex items-center gap-3 p-3.5 flex-wrap">
                <div className="text-sm font-semibold text-gray-900 w-14 shrink-0">{formatTime(a.time)}</div>
                <div className="flex-1 min-w-[140px]">
                  <p className="font-medium text-gray-900 truncate">
                    {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{a.consultation_type?.name || a.notes || 'Consultation'}</p>
                </div>

                {current && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${current.chip}`}>{current.label}</span>
                )}

                <div className="flex items-center gap-1">
                  {QUEUE.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setQueue(a.id, key)}
                      disabled={a.queue_status === key}
                      title={label}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg border transition ${a.queue_status === key ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                  {a.queue_status && (
                    <button onClick={() => setQueue(a.id, null)} title="Réinitialiser" className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400">« Arrivé » pointe automatiquement le patient comme présent dans les statistiques.</p>
    </div>
  )
}
