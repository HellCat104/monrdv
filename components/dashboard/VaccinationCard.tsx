'use client'

// Calendrier vaccinal (pédiatrie) : coche les vaccins faits, calcule la date
// recommandée depuis la naissance, alerte sur le prochain / les retards.
import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { VACCINE_SCHEDULE, recommendedDate, ageLabel } from '@/lib/vaccines'
import { formatDateFr } from '@/lib/utils'
import { Syringe, Check, AlertTriangle, Clock } from 'lucide-react'

export default function VaccinationCard({ patientId, birthDate, initial }: {
  patientId: string
  birthDate: string
  initial: Record<string, string>
}) {
  const supabase = createClient()
  const [done, setDone] = useState<Record<string, string>>(initial || {})
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const today = new Date(); today.setHours(0, 0, 0, 0)

  function save(next: Record<string, string>) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      await supabase.from('patients').update({ vaccines: next }).eq('id', patientId)
      setSaveState('saved'); setTimeout(() => setSaveState('idle'), 1500)
    }, 500)
  }
  function toggle(key: string) {
    setDone((prev) => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = new Date().toISOString().slice(0, 10)
      save(next)
      return next
    })
  }

  // Prochain vaccin dû (non fait) + retards
  const { nextDue, overdue } = useMemo(() => {
    let nextDue: { label: string; date: Date } | null = null
    const overdue: string[] = []
    for (const v of VACCINE_SCHEDULE) {
      if (done[v.key]) continue
      const rec = recommendedDate(birthDate, v.months)
      if (rec < today) overdue.push(v.label)
      else if (!nextDue) nextDue = { label: v.label, date: rec }
    }
    return { nextDue, overdue }
  }, [done, birthDate, today])

  return (
    <div className="border-t border-gray-100 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <Syringe className="h-4 w-4 text-green-500" /> Calendrier vaccinal
        {saveState === 'saved' && <span className="text-[11px] text-green-600 font-normal">✓ enregistré</span>}
      </h4>

      {/* Alertes de suivi */}
      {overdue.length > 0 && (
        <div className="mb-2 text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span><b>{overdue.length} vaccin(s) en retard :</b> {overdue.join(', ')}</span>
        </div>
      )}
      {nextDue && (
        <div className="mb-2 text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span><b>Prochain :</b> {nextDue.label} — recommandé le {formatDateFr(nextDue.date.toISOString())}</span>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
        {VACCINE_SCHEDULE.map((v) => {
          const isDone = !!done[v.key]
          const rec = recommendedDate(birthDate, v.months)
          const isOverdue = !isDone && rec < today
          return (
            <label key={v.key} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50/60">
              <input type="checkbox" checked={isDone} onChange={() => toggle(v.key)}
                className="h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-500 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className={`text-sm ${isDone ? 'text-gray-400 line-through' : isOverdue ? 'text-red-600 font-medium' : 'text-gray-800'}`}>{v.label}</span>
                <span className="block text-[11px] text-gray-400">{ageLabel(v.months)}</span>
              </span>
              {isDone
                ? <span className="text-[11px] text-green-600 flex items-center gap-0.5 shrink-0"><Check className="h-3 w-3" /> {formatDateFr(done[v.key])}</span>
                : isOverdue
                  ? <span className="text-[11px] text-red-500 shrink-0">en retard</span>
                  : <span className="text-[11px] text-gray-300 shrink-0">à venir</span>}
            </label>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Calendrier national marocain (repère indicatif). Cochez un vaccin pour enregistrer sa date.</p>
    </div>
  )
}
