'use client'

// Repères de développement (pédiatrie) : grilles à cocher par âge de visite
// (motricité, langage, audition/vision, social). Acquis ✓ / Non acquis ✗,
// alerte sur les repères non acquis aux âges déjà atteints.
import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MILESTONE_VISITS, DOMAIN_LABELS, type MilestonesMap } from '@/lib/milestones'
import { Baby, Check, X, AlertTriangle } from 'lucide-react'

function ageInMonths(birth: string): number {
  const b = new Date(birth + 'T00:00:00').getTime()
  return Math.max(0, (Date.now() - b) / (1000 * 60 * 60 * 24 * 30.4375))
}

export default function MilestonesCard({ patientId, birthDate, initial }: {
  patientId: string
  birthDate: string
  initial: MilestonesMap
}) {
  const supabase = createClient()
  const ageM = ageInMonths(birthDate)

  // Visite affichée par défaut : la plus proche de l'âge actuel de l'enfant
  const defaultVisit = useMemo(() => {
    let best = MILESTONE_VISITS[0]
    for (const v of MILESTONE_VISITS) if (Math.abs(v.months - ageM) < Math.abs(best.months - ageM)) best = v
    return best.months
  }, [ageM])

  const [visitMonths, setVisitMonths] = useState(defaultVisit)
  const [map, setMap] = useState<MilestonesMap>(initial || {})
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visit = MILESTONE_VISITS.find((v) => v.months === visitMonths)!

  function persist(next: MilestonesMap) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      await supabase.from('patients').update({ milestones: next }).eq('id', patientId)
      setSaveState('saved'); setTimeout(() => setSaveState('idle'), 1500)
    }, 500)
  }

  // Cycle : non évalué → acquis → non acquis → non évalué
  function cycle(key: string) {
    setMap((prev) => {
      const next = { ...prev }
      const cur = next[key]?.s
      if (!cur) next[key] = { s: 'ok', d: new Date().toISOString().slice(0, 10) }
      else if (cur === 'ok') next[key] = { s: 'ko', d: new Date().toISOString().slice(0, 10) }
      else delete next[key]
      persist(next)
      return next
    })
  }

  // Alerte : repères « non acquis » sur les visites déjà atteintes par l'enfant
  const koCount = useMemo(() => {
    let n = 0
    for (const v of MILESTONE_VISITS) {
      if (v.months > ageM) continue
      for (const it of v.items) if (map[it.key]?.s === 'ko') n++
    }
    return n
  }, [map, ageM])

  return (
    <div className="border-t border-gray-100 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <Baby className="h-4 w-4 text-pink-500" /> Développement de l&apos;enfant
        {saveState === 'saved' && <span className="text-[11px] text-green-600 font-normal">✓ enregistré</span>}
      </h4>

      {koCount > 0 && (
        <div className="mb-2 text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span><b>{koCount} repère(s) non acquis</b> aux âges déjà atteints — surveillance / avis spécialisé à discuter.</span>
        </div>
      )}

      {/* Onglets par âge de visite */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {MILESTONE_VISITS.map((v) => {
          const reached = v.months <= ageM
          const hasKo = v.items.some((it) => map[it.key]?.s === 'ko')
          const allOk = v.items.every((it) => map[it.key]?.s === 'ok')
          return (
            <button
              key={v.months}
              onClick={() => setVisitMonths(v.months)}
              className={`text-[11px] px-2 py-1 rounded-full border transition ${
                visitMonths === v.months
                  ? 'bg-pink-500 text-white border-transparent'
                  : hasKo
                    ? 'bg-red-50 text-red-600 border-red-200'
                    : allOk
                      ? 'bg-green-50 text-green-600 border-green-200'
                      : reached
                        ? 'bg-white text-gray-600 border-gray-300'
                        : 'bg-white text-gray-300 border-gray-100'
              }`}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
        {visit.items.map((it) => {
          const st = map[it.key]?.s
          return (
            <button
              key={it.key}
              onClick={() => cycle(it.key)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50/60"
              title="Cliquez pour alterner : acquis → non acquis → non évalué"
            >
              <span className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                st === 'ok' ? 'bg-green-500 border-green-500 text-white'
                : st === 'ko' ? 'bg-red-500 border-red-500 text-white'
                : 'border-gray-300 text-transparent'
              }`}>
                {st === 'ko' ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`text-sm ${st === 'ko' ? 'text-red-600 font-medium' : st === 'ok' ? 'text-gray-500' : 'text-gray-800'}`}>{it.label}</span>
                <span className="block text-[11px] text-gray-400">{DOMAIN_LABELS[it.domain]}</span>
              </span>
              {st && <span className={`text-[11px] shrink-0 ${st === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{st === 'ok' ? 'Acquis' : 'Non acquis'}</span>}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Grille indicative (repères OMS / carnet de santé). Un clic : <b>acquis</b> · deux clics : <b>non acquis</b> · trois : réinitialise.
      </p>
    </div>
  )
}
