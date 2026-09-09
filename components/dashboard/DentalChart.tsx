'use client'

// Schéma dentaire cliquable, affiché dans la fiche patient des dentistes.
// Chaque dent (notation FDI) peut porter PLUSIEURS états à la fois : une couronne
// se carie, une dent obturée devient à extraire… La saisie est donc une série de
// cases à cocher, pas un choix unique.
//
// Sauvegarde automatique (débouncée) via app/api/dental/[id] : depuis la
// migration v55, le navigateur n'écrit plus `dental_charts` directement. C'est
// la route serveur qui compare l'ancien schéma au nouveau et journalise, dent
// par dent, ce qui a changé (table tooth_history). Un journal alimenté par le
// navigateur ne prouverait rien : il ne contiendrait que ce que le client a
// bien voulu déclarer.
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'
import {
  DENTAL_STATES, DENTAL_COLOR, FDI_UPPER, FDI_LOWER,
  normalizeTeeth, toggleToothState, primaryState, stateColors, statesLabel,
  type DentalTeeth, type ToothStatus,
} from '@/lib/dental'
import {
  describeToothChange, formatToothEventDate, toothEventTitle,
  type ToothEvent,
} from '@/lib/dental-history'

export default function DentalChart({ patientId }: { patientId: string; doctorId: string }) {
  const supabase = createClient()
  const [teeth, setTeeth] = useState<DentalTeeth>({})
  const [history, setHistory] = useState<ToothEvent[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // L'enregistrement a réussi mais sa trace n'a pas pu être écrite : le
  // praticien doit le savoir, c'est précisément ce sur quoi il comptera le jour
  // où un patient contestera.
  const [journalKo, setJournalKo] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Le schéma se lit toujours directement (policy SELECT de v20/v55) ;
      // l'historique passe par la route serveur, seule à voir tooth_history et
      // seule à contrôler le forfait de façon non contournable.
      const [chart, hist] = await Promise.all([
        supabase.from('dental_charts').select('teeth').eq('patient_id', patientId).maybeSingle(),
        fetch(`/api/dental/${patientId}`).then((r) => (r.ok ? r.json() : { history: [] })).catch(() => ({ history: [] })),
      ])
      // normalizeTeeth() absorbe l'ancien format « un seul état » ({"16":{"s":"carie"}})
      // encore présent en base : on lit les deux formats, on n'écrit que des tableaux.
      if (!cancelled) {
        setTeeth(normalizeTeeth(chart.data?.teeth))
        setHistory((hist?.history ?? []) as ToothEvent[])
        setLoaded(true)
      }
    })()
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  function scheduleSave(next: DentalTeeth) {
    setSaveState('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      let res: Response
      try {
        res = await fetch(`/api/dental/${patientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teeth: next }),
        })
      } catch { setSaveState('error'); return }
      if (!res.ok) { setSaveState('error'); return }
      const data = await res.json().catch(() => ({}))
      setJournalKo(data.journal === false)
      // Les lignes d'historique nées de CET enregistrement reviennent avec la
      // réponse : le panneau se met à jour sans second aller-retour.
      const events = (data.events ?? []) as ToothEvent[]
      if (events.length > 0) setHistory((prev) => [...events, ...prev])
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
    }, 600)
  }

  // Bascule un état de la dent. La règle métier (« extraite » exclusive) vit dans
  // lib/dental.ts pour rester identique à l'écran et à l'export.
  function toggleState(n: string, s: ToothStatus) {
    setTeeth((prev) => {
      const next = { ...prev }
      const states = toggleToothState(prev[n]?.s ?? [], s)
      // Plus aucun état : la dent sort du schéma (et sa note avec elle).
      if (states.length === 0) delete next[n]
      else next[n] = { ...next[n], s: states }
      scheduleSave(next)
      return next
    })
  }
  function clearTooth(n: string) {
    setTeeth((prev) => {
      const next = { ...prev }
      delete next[n]
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
    const states = info?.s ?? []
    const primary = primaryState(states)
    const color = primary ? DENTAL_COLOR[primary] : undefined
    const colors = stateColors(states)
    const isActive = active === key
    const extraite = primary === 'extraite'
    return (
      <button
        type="button"
        onClick={() => setActive(isActive ? null : key)}
        title={states.length > 0 ? `Dent ${n} — ${statesLabel(states)}${info?.n ? ` (${info.n})` : ''}` : `Dent ${n}`}
        style={color ? { backgroundColor: color, color: '#fff', borderColor: color } : undefined}
        className={`relative w-7 h-9 shrink-0 rounded text-[10px] font-semibold border border-gray-300 bg-white text-gray-600 transition ${isActive ? 'ring-2 ring-primary-500 ring-offset-1' : ''} ${extraite ? 'opacity-80' : ''}`}
      >
        <span className={`block ${colors.length > 1 ? 'pb-2' : ''} ${extraite ? 'line-through' : ''}`}>{n}</span>
        {/* États multiples : une pastille par état, posée sur un liseré blanc pour
            rester lisible par-dessus la couleur principale. Un dégradé serait
            illisible à 28 px de large ; des pastilles se comptent d'un coup d'œil. */}
        {colors.length > 1 && (
          <span className="absolute inset-x-[3px] bottom-[3px] flex gap-[1px] h-[7px] rounded-[2px] bg-white p-[1px]">
            {colors.map((c, i) => (
              <span key={i} className="flex-1 rounded-[1px]" style={{ backgroundColor: c }} />
            ))}
          </span>
        )}
      </button>
    )
  }

  // Une arcade = hémi-arcade droite du patient (à gauche de l'écran : vue du
  // praticien), écart médian franc, puis hémi-arcade gauche.
  const Row = ({ ids }: { ids: number[] }) => (
    <div className="flex justify-center">
      <div className="flex gap-1">{ids.slice(0, 8).map((n) => <Tooth key={n} n={n} />)}</div>
      <div className="w-6 shrink-0 flex justify-center"><span className="border-l border-dashed border-gray-300 self-stretch" /></div>
      <div className="flex gap-1">{ids.slice(8).map((n) => <Tooth key={n} n={n} />)}</div>
    </div>
  )

  if (!loaded) {
    return <div className="border-t border-gray-100 pt-4"><div className="h-24 bg-gray-50 rounded animate-pulse" /></div>
  }

  const activeInfo = active ? teeth[active] : undefined
  const activeStates = activeInfo?.s ?? []
  // L'historique de la SEULE dent ouverte, du plus récent au plus ancien (la
  // route renvoie déjà cet ordre). Une dent jamais modifiée n'a pas de bloc.
  const activeHistory = active ? history.filter((e) => e.tooth === active) : []

  return (
    <div className="border-t border-gray-100 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
        <span>🦷</span> Schéma dentaire
        {saveState === 'saving' && <span className="text-[11px] text-gray-400 font-normal">Enregistrement…</span>}
        {saveState === 'saved' && <span className="text-[11px] text-green-600 font-normal inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> Enregistré</span>}
        {saveState === 'error' && <span className="text-[11px] text-red-500 font-normal">Échec de l&apos;enregistrement</span>}
      </h4>
      <p className="text-[11px] text-gray-400 mb-3">Cliquez sur une dent pour indiquer son état ; plusieurs états sont possibles. Notation internationale (FDI).</p>
      {journalKo && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 mb-3">
          Le schéma est enregistré, mais l&apos;historique de la dent n&apos;a pas pu être écrit. Signalez-le : c&apos;est cette trace datée qui fait foi en cas de contestation.
        </p>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5 mx-auto">
          {/* Vue du praticien : le côté droit du patient est à GAUCHE de l'écran.
              Les deux libellés lèvent l'hésitation devant le schéma. */}
          <div className="flex text-[10px] text-gray-400">
            <div className="flex-1 text-center">Droite du patient</div>
            <div className="w-6 shrink-0" />
            <div className="flex-1 text-center">Gauche du patient</div>
          </div>
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
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-800">Dent {active}</span>
            <button type="button" onClick={() => setActive(null)} className="text-xs text-gray-400 hover:text-gray-600">Fermer</button>
          </div>
          <p className="text-[11px] text-gray-400 mb-2">Cochez tous les états qui s&apos;appliquent. « Absente / extraite » s&apos;utilise seule.</p>
          <div className="flex flex-wrap gap-1.5">
            {DENTAL_STATES.map((s) => {
              const on = activeStates.includes(s.key)
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleState(active, s.key)}
                  className={`inline-flex items-center gap-1.5 text-[12px] px-2 py-1.5 rounded border bg-white transition ${on ? 'border-gray-700 text-gray-900 font-semibold' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                >
                  {/* Vraie case à cocher : un bouton simplement coloré ne dit pas
                      à un médecin peu à l'aise qu'il peut en cocher plusieurs. */}
                  <span
                    className="w-4 h-4 rounded-[3px] border inline-flex items-center justify-center shrink-0"
                    style={{ backgroundColor: on ? s.color : '#ffffff', borderColor: on ? s.color : '#cbd5e1' }}
                  >
                    {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  {s.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => clearTooth(active)}
              className="text-[12px] px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-400 hover:text-red-500"
            >
              Tout effacer
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

          {/* Histoire de la dent — l'état actuel ne dit pas d'où il vient.
              C'est la seule pièce que le praticien pourra opposer à un patient
              qui affirme « cette dent était saine ». Bloc masqué tant que la
              dent n'a rien vécu : un cadre vide sous chaque dent neuve
              n'apprendrait rien et alourdirait la saisie courante. */}
          {activeHistory.length > 0 && (
            <div className="mt-3 border-t border-gray-200 pt-2">
              <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Historique de la dent {active}</p>
              <ul className="space-y-1">
                {activeHistory.map((e, i) => {
                  const { kind, texte } = describeToothChange(e.states_before, e.states_after)
                  // La liste est du plus récent au plus ancien : la dernière
                  // ligne est le plus vieil événement connu de cette dent.
                  const premiere = kind === 'creation' && i === activeHistory.length - 1
                  return (
                    <li key={e.id} className="text-[12px] text-gray-700 flex gap-1.5" title={toothEventTitle(e)}>
                      {/* La date ne se comprime jamais (shrink-0) : c'est elle
                          qui fait la valeur de la ligne, un libellé long ne
                          doit pas la renvoyer à la ligne. */}
                      <span className="text-gray-400 shrink-0 tabular-nums">{formatToothEventDate(e.created_at)}</span>
                      <span className="text-gray-300">—</span>
                      <span className="min-w-0">
                        {texte}
                        {/* Ce repère ne s'affiche que sur le plus ancien
                            événement : il dit « c'est ici que la dent entre
                            dans le dossier ». Le mettre sur toute création le
                            rendrait faux dès qu'une dent effacée est ressaisie. */}
                        {premiere && <span className="text-gray-400"> · première mention</span>}
                        {e.actor_role !== 'medecin' && <span className="text-gray-400"> · saisi par le secrétariat</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
