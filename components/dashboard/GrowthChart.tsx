'use client'

// Courbes de croissance (pédiatrie) : poids / taille / périmètre crânien / IMC
// avec couloirs de référence OMS (P3-P15-P50-P85-P97) selon le sexe, et
// détection des ruptures de courbe (changement de ≥ 2 couloirs).
import { useMemo, useState } from 'react'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import { refAt, detectAlerts, type GrowthMetric, type Sex, type GrowthAlert } from '@/lib/oms-growth'

type Vital = { measured_at: string; values: Record<string, number> }

const METRICS: { key: GrowthMetric; label: string; unit: string; color: string }[] = [
  { key: 'weight', label: 'Poids', unit: 'kg', color: '#0ea5e9' },
  { key: 'height', label: 'Taille', unit: 'cm', color: '#16a34a' },
  { key: 'head_circumference', label: 'Périmètre crânien', unit: 'cm', color: '#a855f7' },
  { key: 'bmi', label: 'IMC', unit: 'kg/m²', color: '#f59e0b' },
]

function ageInMonths(birth: string, at: string): number {
  const b = new Date(birth + 'T00:00:00').getTime()
  const d = new Date(at).getTime()
  return Math.max(0, (d - b) / (1000 * 60 * 60 * 24 * 30.4375))
}

const P_LABELS = ['P3', 'P15', 'P50', 'P85', 'P97']

export default function GrowthChart({ birthDate, vitals, sex, gestationalWeeks, readOnly }: {
  birthDate: string
  vitals: Vital[]
  sex?: Sex | null
  gestationalWeeks?: number | null
  readOnly?: boolean
}) {
  const [metric, setMetric] = useState<GrowthMetric>('weight')
  const m = METRICS.find((x) => x.key === metric)!

  // Prématuré (< 37 SA) : âge corrigé jusqu'à 24 mois d'âge réel
  const correctionM = gestationalWeeks && gestationalWeeks < 37 ? ((40 - gestationalWeeks) * 7) / 30.4375 : 0

  // Points de l'enfant — l'IMC est calculé quand poids + taille sont mesurés ensemble
  const pts = useMemo(() => {
    const ageAt = (at: string) => {
      const real = ageInMonths(birthDate, at)
      return correctionM > 0 && real < 24 ? Math.max(0, real - correctionM) : real
    }
    return vitals
      .map((v) => {
        if (metric === 'bmi') {
          const w = v.values?.weight, h = v.values?.height
          if (typeof w !== 'number' || typeof h !== 'number' || h <= 0) return null
          return { x: ageAt(v.measured_at), y: Math.round((w / Math.pow(h / 100, 2)) * 10) / 10 }
        }
        const y = v.values?.[metric]
        return typeof y === 'number' ? { x: ageAt(v.measured_at), y } : null
      })
      .filter((p): p is { x: number; y: number } => p !== null)
      .sort((a, b) => a.x - b.x)
  }, [vitals, metric, birthDate, correctionM])

  // Alertes cliniques : rupture de couloir / mesure hors P3-P97
  const alerts: GrowthAlert[] = useMemo(() => {
    if (!sex || pts.length === 0) return []
    return detectAlerts(sex, metric, pts, m.label)
  }, [sex, metric, pts, m.label])

  // Dimensions SVG
  const W = 480, H = 250, PL = 40, PR = 30, PT = 12, PB = 30
  const plotW = W - PL - PR, plotH = H - PT - PB

  const chart = useMemo(() => {
    if (pts.length === 0) return null
    const xs = pts.map((p) => p.x)
    let xMin = Math.min(...xs), xMax = Math.max(...xs)
    if (xMax - xMin < 3) { xMax = xMin + 3 }

    // Échantillonne les couloirs OMS sur la plage d'âge affichée
    const bandSamples: { x: number; v: [number, number, number, number, number] }[] = []
    if (sex) {
      const steps = 32
      for (let i = 0; i <= steps; i++) {
        const x = xMin + ((xMax - xMin) * i) / steps
        const v = refAt(sex, metric, x)
        if (v) bandSamples.push({ x, v })
      }
    }

    // Domaine Y : mesures de l'enfant + couloirs visibles
    let yMin = Math.min(...pts.map((p) => p.y))
    let yMax = Math.max(...pts.map((p) => p.y))
    for (const b of bandSamples) { yMin = Math.min(yMin, b.v[0]); yMax = Math.max(yMax, b.v[4]) }
    if (yMax - yMin < 1) { yMax = yMin + 1 }
    const pad = (yMax - yMin) * 0.08; yMin -= pad; yMax += pad

    const sx = (x: number) => PL + ((x - xMin) / (xMax - xMin)) * plotW
    const sy = (y: number) => PT + plotH - ((y - yMin) / (yMax - yMin)) * plotH

    // Zones de couloirs : P3→P97 (clair) et P15→P85 (plus soutenu) + médiane
    let outerBand = '', innerBand = '', medianPath = ''
    if (bandSamples.length > 1) {
      const fwd = (k: number) => bandSamples.map((b, i) => `${i === 0 ? 'M' : 'L'} ${sx(b.x).toFixed(1)} ${sy(b.v[k]).toFixed(1)}`).join(' ')
      const back = (k: number) => [...bandSamples].reverse().map((b) => `L ${sx(b.x).toFixed(1)} ${sy(b.v[k]).toFixed(1)}`).join(' ')
      outerBand = `${fwd(4)} ${back(0)} Z`
      innerBand = `${fwd(3)} ${back(1)} Z`
      medianPath = fwd(2)
    }

    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')
    const xTicks = 4, yTicks = 4
    const xLabels = Array.from({ length: xTicks + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / xTicks)
    const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks)
    // Étiquettes P3…P97 au bord droit
    const lastBand = bandSamples[bandSamples.length - 1]
    return { sx, sy, path, xLabels, yLabels, outerBand, innerBand, medianPath, lastBand }
  }, [pts, sex, metric, plotW, plotH])

  const fmtAge = (months: number) => months < 24 ? `${Math.round(months)} m` : `${(months / 12).toFixed(months % 12 === 0 ? 0 : 1)} a`

  return (
    <div className="border-t border-gray-100 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-primary-500" /> Courbe de croissance
        {sex && <span className="text-[11px] font-normal text-gray-400">— couloirs OMS ({sex === 'M' ? 'garçon' : 'fille'})</span>}
        {correctionM > 0 && (
          <span className="text-[11px] font-normal bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full">
            âge corrigé · né(e) à {gestationalWeeks} SA
          </span>
        )}
      </h4>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {METRICS.map((x) => (
          <button
            key={x.key}
            onClick={() => setMetric(x.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${metric === x.key ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
            style={metric === x.key ? { backgroundColor: x.color } : undefined}
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* Alertes : rupture de courbe / hors couloirs */}
      {alerts.map((a, i) => (
        <div key={i} className="mb-2 text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span><b>{a.type === 'rupture' ? 'Rupture de courbe' : 'Hors couloirs'} :</b> {a.message.replace(/^[^:]+:\s*/, '')} À contrôler.</span>
        </div>
      ))}

      {!sex && pts.length > 0 && !readOnly && (
        <p className="mb-2 text-[11px] bg-blue-50 text-blue-600 rounded-lg px-3 py-2">
          💡 Renseignez le <b>sexe de l&apos;enfant</b> dans sa fiche pour afficher les couloirs de référence OMS (P3 · P50 · P97) et détecter les ruptures de courbe.
        </p>
      )}

      {pts.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          {metric === 'bmi'
            ? 'L\'IMC se calcule automatiquement quand poids et taille sont mesurés le même jour.'
            : `Aucune mesure de ${m.label.toLowerCase()} enregistrée. Saisissez des constantes pour voir la courbe.`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 520 }} role="img" aria-label={`Courbe de ${m.label}`}>
            {/* couloirs OMS */}
            {chart!.outerBand && <path d={chart!.outerBand} fill={m.color} opacity="0.08" />}
            {chart!.innerBand && <path d={chart!.innerBand} fill={m.color} opacity="0.10" />}
            {chart!.medianPath && <path d={chart!.medianPath} fill="none" stroke={m.color} strokeWidth="1" strokeDasharray="4 3" opacity="0.45" />}
            {/* étiquettes des percentiles au bord droit */}
            {chart!.lastBand && [0, 2, 4].map((k, i) => (
              <text key={i} x={PL + plotW + 3} y={chart!.sy(chart!.lastBand!.v[k]) + 3} fontSize="8" fill="#9ca3af">{P_LABELS[k]}</text>
            ))}
            {/* axes */}
            <line x1={PL} y1={PT} x2={PL} y2={PT + plotH} stroke="#e5e7eb" />
            <line x1={PL} y1={PT + plotH} x2={PL + plotW} y2={PT + plotH} stroke="#e5e7eb" />
            {/* grille + labels Y */}
            {chart!.yLabels.map((v, i) => {
              const y = chart!.sy(v)
              return (
                <g key={i}>
                  <line x1={PL} y1={y} x2={PL + plotW} y2={y} stroke="#f3f4f6" />
                  <text x={PL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{v.toFixed(0)}</text>
                </g>
              )
            })}
            {/* labels X (âge) */}
            {chart!.xLabels.map((v, i) => (
              <text key={i} x={chart!.sx(v)} y={PT + plotH + 16} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmtAge(v)}</text>
            ))}
            <text x={PL + plotW / 2} y={H - 2} textAnchor="middle" fontSize="9" fill="#6b7280">Âge</text>
            <text x={12} y={PT + plotH / 2} textAnchor="middle" fontSize="9" fill="#6b7280" transform={`rotate(-90 12 ${PT + plotH / 2})`}>{m.label} ({m.unit})</text>
            {/* courbe de l'enfant */}
            {pts.length > 1 && <path d={chart!.path} fill="none" stroke={m.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {pts.map((p, i) => (
              <circle key={i} cx={chart!.sx(p.x)} cy={chart!.sy(p.y)} r="3" fill="#fff" stroke={m.color} strokeWidth="2" />
            ))}
          </svg>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1">
        {sex
          ? `Couloirs indicatifs OMS (P3 · P15 · P50 · P85 · P97) — taille/IMC jusqu'à 15 ans, poids jusqu'à 10 ans, PC jusqu'à 5 ans. Zone foncée : P15-P85.${correctionM > 0 ? ' Âge corrigé appliqué jusqu\'à 24 mois.' : ''}`
          : `Évolution du ${m.label.toLowerCase()} de l'enfant dans le temps.${readOnly ? '' : ' Saisissez les constantes à chaque visite pour un suivi précis.'}`}
      </p>
    </div>
  )
}
