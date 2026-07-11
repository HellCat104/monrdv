'use client'

// Courbes de croissance (pédiatrie) : poids / taille / périmètre crânien
// tracés en fonction de l'âge de l'enfant (calculé depuis sa date de naissance).
import { useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Vital = { measured_at: string; values: Record<string, number> }

const METRICS = [
  { key: 'weight', label: 'Poids', unit: 'kg', color: '#0ea5e9' },
  { key: 'height', label: 'Taille', unit: 'cm', color: '#16a34a' },
  { key: 'head_circumference', label: 'Périmètre crânien', unit: 'cm', color: '#a855f7' },
] as const

function ageInMonths(birth: string, at: string): number {
  const b = new Date(birth + 'T00:00:00').getTime()
  const d = new Date(at).getTime()
  return Math.max(0, (d - b) / (1000 * 60 * 60 * 24 * 30.4375))
}

export default function GrowthChart({ birthDate, vitals }: { birthDate: string; vitals: Vital[] }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('weight')
  const m = METRICS.find((x) => x.key === metric)!

  const pts = useMemo(() => {
    return vitals
      .filter((v) => v.values && typeof v.values[metric] === 'number')
      .map((v) => ({ x: ageInMonths(birthDate, v.measured_at), y: v.values[metric] }))
      .sort((a, b) => a.x - b.x)
  }, [vitals, metric, birthDate])

  // Dimensions SVG
  const W = 480, H = 240, PL = 40, PR = 14, PT = 12, PB = 30
  const plotW = W - PL - PR, plotH = H - PT - PB

  const chart = useMemo(() => {
    if (pts.length === 0) return null
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    let xMin = Math.min(...xs), xMax = Math.max(...xs)
    let yMin = Math.min(...ys), yMax = Math.max(...ys)
    if (xMax - xMin < 1) { xMax = xMin + 1 }
    if (yMax - yMin < 1) { yMax = yMin + 1 }
    // marge verticale
    const pad = (yMax - yMin) * 0.15; yMin -= pad; yMax += pad
    const sx = (x: number) => PL + ((x - xMin) / (xMax - xMin)) * plotW
    const sy = (y: number) => PT + plotH - ((y - yMin) / (yMax - yMin)) * plotH
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')
    // ticks
    const xTicks = 4, yTicks = 4
    const xLabels = Array.from({ length: xTicks + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / xTicks)
    const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks)
    return { sx, sy, path, xLabels, yLabels }
  }, [pts, plotW, plotH])

  const fmtAge = (months: number) => months < 24 ? `${Math.round(months)} m` : `${(months / 12).toFixed(months % 12 === 0 ? 0 : 1)} a`

  return (
    <div className="border-t border-gray-100 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-primary-500" /> Courbe de croissance
      </h4>

      <div className="flex gap-1.5 mb-3">
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

      {pts.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Aucune mesure de {m.label.toLowerCase()} enregistrée. Saisissez des constantes pour voir la courbe.</p>
      ) : pts.length === 1 ? (
        <p className="text-xs text-gray-500">1 seule mesure : {m.label} {pts[0].y} {m.unit} à {fmtAge(pts[0].x)}. La courbe apparaît dès la 2ᵉ mesure.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 520 }} role="img" aria-label={`Courbe de ${m.label}`}>
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
            {/* courbe */}
            <path d={chart!.path} fill="none" stroke={m.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={chart!.sx(p.x)} cy={chart!.sy(p.y)} r="3" fill="#fff" stroke={m.color} strokeWidth="2" />
            ))}
          </svg>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1">Évolution du {m.label.toLowerCase()} de l&apos;enfant dans le temps. Saisissez les constantes à chaque visite pour un suivi précis.</p>
    </div>
  )
}
