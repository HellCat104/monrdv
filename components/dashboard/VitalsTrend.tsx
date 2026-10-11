'use client'

// Évolution des constantes dans le temps — adultes.
//
// POURQUOI CET ÉCRAN EXISTE
//
// Les constantes étaient affichées en LISTE : « 14/9 le 2 septembre, 13/8 le
// 4 octobre ». Suivre un hypertendu ou un diabétique sur un an, c'est
// précisément voir une courbe — la liste oblige à comparer de tête, et
// personne ne le fait. Le composant de courbe existait déjà, mais il était
// réservé aux enfants (couloirs OMS) : un adulte n'y avait pas droit.
//
// Ici, pas de couloirs de référence : on trace ce qui a été mesuré. Une norme
// affichée sur un écran de cabinet deviendrait un diagnostic automatique, et
// ce n'est pas le rôle du logiciel.
import { useMemo, useState } from 'react'
import { formatDateShort } from '@/lib/utils'
import type { VitalDef } from '@/types'
import { TrendingUp } from 'lucide-react'

interface Mesure { id: string; measured_at: string; values: Record<string, number> }

// La tension se lit en couple : deux courbes sur le même graphique, parce
// qu'une systolique seule ne dit rien.
const COUPLES: Record<string, { avec: string; label: string }> = {
  systolic: { avec: 'diastolic', label: 'Tension artérielle' },
}

export default function VitalsTrend({
  vitals,
  vitalDefs,
}: {
  vitals: Mesure[]
  vitalDefs: VitalDef[]
}) {
  // Les constantes réellement mesurées au moins deux fois : une courbe à un
  // seul point n'est pas une courbe.
  const disponibles = useMemo(() => {
    const compte = new Map<string, number>()
    for (const m of vitals) {
      for (const [k, v] of Object.entries(m.values ?? {})) {
        if (Number.isFinite(Number(v))) compte.set(k, (compte.get(k) ?? 0) + 1)
      }
    }
    return Array.from(compte.entries())
      .filter(([k, n]) => n >= 2 && k !== 'diastolic')
      .map(([k]) => k)
  }, [vitals])

  const [choix, setChoix] = useState<string | null>(null)
  const metrique = choix && disponibles.includes(choix) ? choix : disponibles[0]

  if (!metrique) return null

  const def = (k: string) => vitalDefs.find((d) => d.key === k)
  const couple = COUPLES[metrique]
  const cles = couple ? [metrique, couple.avec] : [metrique]

  // Points triés du plus ancien au plus récent : une courbe se lit de gauche
  // à droite, comme le temps.
  const points = vitals
    .filter((m) => Number.isFinite(Number(m.values?.[metrique])))
    .map((m) => ({
      date: m.measured_at,
      valeurs: cles.map((k) => {
        const v = Number(m.values?.[k])
        return Number.isFinite(v) ? v : null
      }),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (points.length < 2) return null

  const toutes = points.flatMap((p) => p.valeurs).filter((v): v is number => v !== null)
  const min = Math.min(...toutes)
  const max = Math.max(...toutes)
  // Marge de 10 % pour que la courbe ne colle ni au plafond ni au plancher.
  const marge = (max - min) * 0.1 || 1
  const bas = min - marge
  const haut = max + marge

  const L = 560, H = 180, PL = 42, PR = 12, PT = 14, PB = 26
  const largeur = L - PL - PR
  const hauteur = H - PT - PB
  const x = (i: number) => PL + (points.length === 1 ? largeur / 2 : (i / (points.length - 1)) * largeur)
  const y = (v: number) => PT + hauteur - ((v - bas) / (haut - bas)) * hauteur

  const COULEURS = ['#1D5FD0', '#94a3b8']
  const dernier = points[points.length - 1]
  const premier = points[0]

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4" /> Évolution
        </h3>
        <div className="flex gap-1.5 flex-wrap">
          {disponibles.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setChoix(k)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${metrique === k ? 'bg-primary-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              {COUPLES[k]?.label ?? def(k)?.label ?? k}
            </button>
          ))}
        </div>
      </div>

      {/* La dernière valeur en grand : c'est elle qu'on cherche en ouvrant. */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold text-gray-900 tabular-nums">
          {couple
            ? `${dernier.valeurs[0]}/${dernier.valeurs[1] ?? '—'}`
            : dernier.valeurs[0]}
        </span>
        <span className="text-sm text-gray-400">{def(metrique)?.unit}</span>
        <span className="text-xs text-gray-400">le {formatDateShort(dernier.date)}</span>
      </div>

      <svg viewBox={`0 0 ${L} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Repères horizontaux : trois lignes suffisent à situer une valeur. */}
        {[0, 0.5, 1].map((p) => {
          const v = bas + (haut - bas) * (1 - p)
          return (
            <g key={p}>
              <line x1={PL} y1={PT + hauteur * p} x2={L - PR} y2={PT + hauteur * p} stroke="#eef2f7" strokeWidth={1} />
              <text x={PL - 6} y={PT + hauteur * p + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
                {Math.round(v)}
              </text>
            </g>
          )
        })}

        {cles.map((k, idx) => {
          const serie = points
            .map((p, i) => ({ i, v: p.valeurs[idx] }))
            .filter((p): p is { i: number; v: number } => p.v !== null)
          if (serie.length < 2) return null
          const d = serie.map((p, n) => `${n === 0 ? 'M' : 'L'} ${x(p.i)} ${y(p.v)}`).join(' ')
          return (
            <g key={k}>
              <path d={d} fill="none" stroke={COULEURS[idx] ?? '#94a3b8'} strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />
              {serie.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={3.5} fill="#fff"
                  stroke={COULEURS[idx] ?? '#94a3b8'} strokeWidth={2} />
              ))}
            </g>
          )
        })}

        <text x={PL} y={H - 8} fontSize="9" fill="#9ca3af">{formatDateShort(premier.date)}</text>
        <text x={L - PR} y={H - 8} fontSize="9" fill="#9ca3af" textAnchor="end">{formatDateShort(dernier.date)}</text>
      </svg>

      <p className="text-[11px] text-gray-400 mt-1">
        {points.length} mesure{points.length > 1 ? 's' : ''} ·{' '}
        {couple ? 'systolique en bleu, diastolique en gris' : 'valeurs mesurées au cabinet'}
      </p>
    </div>
  )
}
