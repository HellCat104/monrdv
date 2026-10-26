'use client'

// Le poids, et surtout SA VARIATION.
//
// En gastro-entérologie l'amaigrissement est un signe d'alarme : il fait
// basculer un reflux banal vers une endoscopie, et il pèse dans le suivi d'une
// MICI comme d'une cirrhose. Le poids était enregistré dans les constantes
// depuis toujours — mais pour savoir s'il baissait, il fallait ouvrir
// l'onglet, lire deux chiffres et faire la soustraction de tête. Sur dix
// patients par jour, personne ne la fait.
//
// Ce bloc ne calcule rien de clinique : il soustrait deux nombres mesurés et
// dit lequel est le plus ancien. Il ne qualifie pas la perte, il la montre.
import type { VitalSign } from '@/types'
import { formatDateFr } from '@/lib/utils'
import { TrendingDown, TrendingUp, Minus, Scale } from 'lucide-react'

interface Mesure { date: string; poids: number }

/** Seuil à partir duquel une perte est MONTRÉE en orange. Pas un diagnostic :
 *  un repère de lecture. 5 % du poids du corps est le chiffre habituellement
 *  retenu comme significatif ; en deçà, la balance et l'heure de la pesée
 *  suffisent à expliquer l'écart. */
const SEUIL_PERTE_PCT = 5

export default function SuiviPoids({ vitals }: { vitals: VitalSign[] }) {
  // Du plus ancien au plus récent, et seulement ce qui porte un poids.
  const mesures: Mesure[] = vitals
    .map((v) => ({ date: v.measured_at, poids: Number((v.values ?? {}).weight) }))
    .filter((m) => Number.isFinite(m.poids) && m.poids > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (mesures.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5 mb-1">
          <Scale className="h-4 w-4" /> Poids
        </h3>
        <p className="text-xs text-gray-400 italic">
          Aucun poids enregistré. Saisissez-le dans les constantes : c’est la mesure qui sert le plus ici.
        </p>
      </div>
    )
  }

  const dernier = mesures[mesures.length - 1]
  const precedent = mesures.length > 1 ? mesures[mesures.length - 2] : null
  const premier = mesures[0]

  const ecart = precedent ? dernier.poids - precedent.poids : null
  // La variation depuis la PREMIÈRE mesure : sur un suivi long, c'est elle qui
  // compte. Une perte de 800 g par consultation ne se voit nulle part, et fait
  // huit kilos en dix visites.
  const ecartTotal = mesures.length > 2 ? dernier.poids - premier.poids : null
  const pctTotal = ecartTotal != null && premier.poids > 0 ? (ecartTotal / premier.poids) * 100 : null
  const perteNotable = pctTotal != null && pctTotal <= -SEUIL_PERTE_PCT

  // Mini-courbe : la forme suffit à voir une pente, et elle tient sur une
  // ligne. Pas de bibliothèque ajoutée pour ça.
  const min = Math.min(...mesures.map((m) => m.poids))
  const max = Math.max(...mesures.map((m) => m.poids))
  const amplitude = max - min || 1
  const points = mesures.map((m, i) => {
    const x = mesures.length === 1 ? 0 : (i / (mesures.length - 1)) * 100
    const y = 28 - ((m.poids - min) / amplitude) * 24
    return `${x},${y}`
  }).join(' ')

  return (
    <div className={`bg-white border rounded-xl p-4 ${perteNotable ? 'border-orange-200' : 'border-gray-100'}`}>
      <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5 mb-2">
        <Scale className="h-4 w-4" /> Poids
      </h3>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-bold text-gray-900">{dernier.poids} kg</span>
        <span className="text-[11px] text-gray-400">le {formatDateFr(dernier.date)}</span>
      </div>

      {ecart != null && (
        <p className={`text-xs mt-1 flex items-center gap-1 ${ecart < 0 ? 'text-orange-700' : ecart > 0 ? 'text-gray-600' : 'text-gray-400'}`}>
          {ecart < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : ecart > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
          {ecart === 0 ? 'Stable' : `${ecart > 0 ? '+' : ''}${arrondi(ecart)} kg`}
          {/* Deux pesées le même jour, cela arrive — une à l'accueil, une au
              cabinet. Répéter la date donnait « 62 kg le 21 octobre, −6 kg
              depuis le 21 octobre », qu'on relit deux fois avant de comprendre. */}
          {' '}{memeJour(dernier.date, precedent!.date)
            ? 'depuis la pesée précédente'
            : `depuis le ${formatDateFr(precedent!.date)}`}
        </p>
      )}

      {mesures.length > 1 && (
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-10 mt-2" aria-hidden>
          <polyline points={points} fill="none" stroke={perteNotable ? '#ea580c' : '#0ea5e9'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      {ecartTotal != null && (
        <p className="text-[11px] text-gray-500 mt-1">
          {ecartTotal > 0 ? '+' : ''}{arrondi(ecartTotal)} kg depuis le {formatDateFr(premier.date)}
          {pctTotal != null && ` (${pctTotal > 0 ? '+' : ''}${pctTotal.toFixed(1)} %)`}
          {' · '}{mesures.length} mesures
        </p>
      )}

      {perteNotable && (
        // On MONTRE, on ne conclut pas : c'est le praticien qui décide si cette
        // perte compte, et pourquoi.
        <p className="text-[11px] text-orange-700 mt-1.5 leading-snug">
          Perte supérieure à {SEUIL_PERTE_PCT} % du poids initial sur la période affichée.
        </p>
      )}
    </div>
  )
}

/** Deux horodatages tombent-ils le même jour de calendrier ? */
function memeJour(a: string, b: string): boolean {
  return a.substring(0, 10) === b.substring(0, 10)
}

/** Un chiffre après la virgule, et pas de « -0 ». */
function arrondi(n: number): string {
  const v = Math.round(n * 10) / 10
  return Object.is(v, -0) ? '0' : String(v)
}
