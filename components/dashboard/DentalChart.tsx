'use client'

// Schéma dentaire cliquable, affiché dans la fiche patient des dentistes.
// Chaque dent (notation FDI) peut recevoir un état : carie, plombage, couronne…
// Sauvegarde automatique (débouncée) dans la table dental_charts.
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'
import { DENTAL_STATES, DENTAL_COLOR, FDI_UPPER, FDI_LOWER, type DentalTeeth, type ToothStatus } from '@/lib/dental'

export default function DentalChart({ patientId, doctorId }: { patientId: string; doctorId: string }) {
  const supabase = createClient()
  const [teeth, setTeeth] = useState<DentalTeeth>({})
  const [active, setActive] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('dental_charts').select('teeth').eq('patient_id', patientId).maybeSingle()
      if (!cancelled) { setTeeth((data?.teeth as DentalTeeth) ?? {}); setLoaded(true) }
    })()
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  function scheduleSave(next: DentalTeeth) {
    setSaveState('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from('dental_charts').upsert(
        { patient_id: patientId, doctor_id: doctorId, teeth: next, updated_at: new Date().toISOString() },
        { onConflict: 'patient_id' },
      )
      if (error) { setSaveState('error'); return }
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
    }, 600)
  }

  function setStatus(n: string, s: ToothStatus | null) {
    setTeeth((prev) => {
      const next = { ...prev }
      if (s == null) delete next[n]
      else next[n] = { ...next[n], s }
      scheduleSave(next)
      return next
    })
  }
  function setNote(n: string, note: string) {
    setTeeth((prev) => {
      const cur = prev[n]
      if (!cur) return prev // pas de note sans état
      const next = { ...prev, [n]: { ...cur, n: note || undefined } }
      scheduleSave(next)
      return next
    })
  }

  const Tooth = ({ n }: { n: number }) => {
    const key = String(n)
    const info = teeth[key]
    const color = info ? DENTAL_COLOR[info.s] : undefined
    const isActive = active === key
    const extraite = info?.s === 'extraite'
    return (
      <button
        type="button"
        onClick={() => setActive(isActive ? null : key)}
        title={`Dent ${n}`}
        style={color ? { backgroundColor: color, color: '#fff', borderColor: color } : undefined}
        className={`w-7 h-8 shrink-0 rounded text-[10px] font-semibold border border-gray-300 bg-white text-gray-600 transition ${isActive ? 'ring-2 ring-primary-500 ring-offset-1' : ''} ${extraite ? 'line-through opacity-80' : ''}`}
      >
        {n}
      </button>
    )
  }

  const Row = ({ ids }: { ids: number[] }) => (
    <div className="flex gap-1 justify-center">
      <div className="flex gap-1">{ids.slice(0, 8).map((n) => <Tooth key={n} n={n} />)}</div>
      <div className="w-px bg-gray-300 mx-1 self-stretch" />
      <div className="flex gap-1">{ids.slice(8).map((n) => <Tooth key={n} n={n} />)}</div>
    </div>
  )

  if (!loaded) {
    return <div className="border-t border-gray-100 pt-4"><div className="h-24 bg-gray-50 rounded animate-pulse" /></div>
  }

  const activeInfo = active ? teeth[active] : undefined

  return (
    <div className="border-t border-gray-100 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
        <span>🦷</span> Schéma dentaire
        {saveState === 'saving' && <span className="text-[11px] text-gray-400 font-normal">Enregistrement…</span>}
        {saveState === 'saved' && <span className="text-[11px] text-green-600 font-normal inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> Enregistré</span>}
        {saveState === 'error' && <span className="text-[11px] text-red-500 font-normal">Échec de l&apos;enregistrement</span>}
      </h4>
      <p className="text-[11px] text-gray-400 mb-3">Cliquez sur une dent pour indiquer son état. Notation internationale (FDI).</p>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5 mx-auto">
          <Row ids={FDI_UPPER} />
          <div className="text-center text-[9px] text-gray-300 tracking-widest">— haut / bas —</div>
          <Row ids={FDI_LOWER} />
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
        {DENTAL_STATES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: s.color }} /> {s.label}
          </span>
        ))}
      </div>

      {/* Éditeur de la dent sélectionnée */}
      {active && (
        <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-800">Dent {active}</span>
            <button type="button" onClick={() => setActive(null)} className="text-xs text-gray-400 hover:text-gray-600">Fermer</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DENTAL_STATES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(active, s.key)}
                style={activeInfo?.s === s.key ? { backgroundColor: s.color, borderColor: s.color, color: '#fff' } : undefined}
                className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStatus(active, null)}
              className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-400 hover:text-red-500"
            >
              Effacer
            </button>
          </div>
          {activeInfo && (
            <input
              value={activeInfo.n ?? ''}
              onChange={(e) => setNote(active, e.target.value)}
              placeholder="Note (facultatif) — ex : à surveiller"
              className="mt-2 w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          )}
        </div>
      )}
    </div>
  )
}
