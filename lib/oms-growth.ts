// Références de croissance OMS (0-5 ans) — couloirs indicatifs par sexe.
// Valeurs aux âges-clés (mois) : [âge, −2DS, −1DS, médiane, +1DS, +2DS],
// interpolation linéaire entre deux âges. En percentiles : −2DS ≈ P3,
// −1DS ≈ P15, médiane = P50, +1DS ≈ P85, +2DS ≈ P97 (norme OMS 2006).
// Usage : repérage visuel des couloirs et des ruptures de courbe — ne remplace
// pas les tables officielles pour un diagnostic.

export type GrowthMetric = 'weight' | 'height' | 'head_circumference' | 'bmi'
export type Sex = 'M' | 'F'

// [mois, -2DS, -1DS, médiane, +1DS, +2DS]
type Row = [number, number, number, number, number, number]

const WEIGHT_M: Row[] = [
  [0, 2.5, 2.9, 3.3, 3.9, 4.4],
  [2, 4.3, 4.9, 5.6, 6.3, 7.1],
  [4, 5.6, 6.2, 7.0, 7.8, 8.7],
  [6, 6.4, 7.1, 7.9, 8.8, 9.8],
  [9, 7.1, 8.0, 8.9, 9.9, 11.0],
  [12, 7.7, 8.6, 9.6, 10.8, 12.0],
  [18, 8.8, 9.8, 10.9, 12.2, 13.7],
  [24, 9.7, 10.8, 12.2, 13.6, 15.3],
  [36, 11.3, 12.7, 14.3, 16.2, 18.3],
  [48, 12.7, 14.4, 16.3, 18.6, 21.2],
  [60, 14.1, 16.0, 18.3, 21.0, 24.2],
]
const WEIGHT_F: Row[] = [
  [0, 2.4, 2.8, 3.2, 3.7, 4.2],
  [2, 3.9, 4.5, 5.1, 5.8, 6.6],
  [4, 5.0, 5.7, 6.4, 7.3, 8.2],
  [6, 5.7, 6.5, 7.3, 8.2, 9.3],
  [9, 6.5, 7.3, 8.2, 9.3, 10.5],
  [12, 7.0, 7.9, 8.9, 10.1, 11.5],
  [18, 8.1, 9.1, 10.2, 11.6, 13.2],
  [24, 9.0, 10.2, 11.5, 13.0, 14.8],
  [36, 10.8, 12.2, 13.9, 15.8, 18.1],
  [48, 12.3, 14.0, 16.1, 18.5, 21.5],
  [60, 13.7, 15.8, 18.2, 21.2, 24.9],
]
const HEIGHT_M: Row[] = [
  [0, 46.1, 48.0, 49.9, 51.8, 53.7],
  [2, 54.4, 56.4, 58.4, 60.4, 62.4],
  [4, 59.7, 61.8, 63.9, 66.0, 68.0],
  [6, 63.3, 65.5, 67.6, 69.8, 71.9],
  [9, 67.5, 69.7, 72.0, 74.2, 76.5],
  [12, 71.0, 73.4, 75.7, 78.1, 80.5],
  [18, 76.9, 79.6, 82.3, 85.0, 87.7],
  [24, 81.0, 84.1, 87.1, 90.2, 93.2],
  [36, 88.7, 92.4, 96.1, 99.8, 103.5],
  [48, 94.9, 99.1, 103.3, 107.5, 111.7],
  [60, 100.7, 105.3, 110.0, 114.6, 119.2],
]
const HEIGHT_F: Row[] = [
  [0, 45.4, 47.3, 49.1, 51.0, 52.9],
  [2, 53.0, 55.0, 57.1, 59.1, 61.1],
  [4, 57.8, 59.9, 62.1, 64.3, 66.4],
  [6, 61.2, 63.5, 65.7, 68.0, 70.3],
  [9, 65.3, 67.7, 70.1, 72.6, 75.0],
  [12, 68.9, 71.4, 74.0, 76.6, 79.2],
  [18, 74.9, 77.8, 80.7, 83.6, 86.5],
  [24, 80.0, 83.2, 86.4, 89.6, 92.9],
  [36, 87.4, 91.2, 95.1, 98.9, 102.7],
  [48, 94.1, 98.4, 102.7, 107.0, 111.3],
  [60, 99.9, 104.7, 109.4, 114.2, 118.9],
]
const HC_M: Row[] = [
  [0, 31.9, 33.2, 34.5, 35.7, 37.0],
  [2, 36.8, 38.0, 39.1, 40.3, 41.5],
  [4, 39.2, 40.4, 41.6, 42.8, 44.0],
  [6, 40.9, 42.1, 43.3, 44.6, 45.8],
  [9, 42.5, 43.8, 45.0, 46.3, 47.5],
  [12, 43.5, 44.8, 46.1, 47.4, 48.6],
  [18, 44.7, 46.0, 47.4, 48.7, 50.0],
  [24, 45.5, 46.9, 48.3, 49.6, 51.0],
  [36, 46.6, 48.0, 49.5, 50.9, 52.3],
  [48, 47.3, 48.7, 50.2, 51.7, 53.1],
  [60, 47.7, 49.1, 50.7, 52.2, 53.8],
]
const HC_F: Row[] = [
  [0, 31.5, 32.7, 33.9, 35.1, 36.2],
  [2, 35.8, 37.0, 38.3, 39.5, 40.7],
  [4, 38.1, 39.3, 40.6, 41.8, 43.1],
  [6, 39.6, 40.9, 42.2, 43.5, 44.8],
  [9, 41.2, 42.5, 43.8, 45.1, 46.4],
  [12, 42.2, 43.5, 44.9, 46.2, 47.5],
  [18, 43.5, 44.9, 46.2, 47.6, 49.0],
  [24, 44.4, 45.8, 47.2, 48.6, 50.0],
  [36, 45.7, 47.1, 48.6, 50.0, 51.4],
  [48, 46.5, 47.9, 49.4, 50.9, 52.3],
  [60, 47.1, 48.5, 50.0, 51.5, 52.9],
]
const BMI_M: Row[] = [
  [0, 11.1, 12.2, 13.4, 14.8, 16.3],
  [2, 13.8, 15.0, 16.3, 17.8, 19.4],
  [4, 14.4, 15.7, 17.0, 18.6, 20.3],
  [6, 14.7, 15.9, 17.3, 18.9, 20.5],
  [9, 14.7, 15.8, 17.2, 18.7, 20.3],
  [12, 14.6, 15.7, 17.0, 18.4, 20.1],
  [18, 14.3, 15.4, 16.7, 18.0, 19.6],
  [24, 14.2, 15.3, 16.5, 17.9, 19.4],
  [36, 13.9, 14.9, 16.0, 17.2, 18.6],
  [48, 13.7, 14.7, 15.7, 17.0, 18.5],
  [60, 13.5, 14.5, 15.5, 16.9, 18.5],
]
const BMI_F: Row[] = [
  [0, 10.8, 12.0, 13.3, 14.7, 16.1],
  [2, 13.2, 14.5, 15.8, 17.3, 19.0],
  [4, 13.9, 15.2, 16.6, 18.2, 20.0],
  [6, 14.1, 15.4, 16.9, 18.6, 20.4],
  [9, 14.1, 15.3, 16.7, 18.3, 20.1],
  [12, 14.2, 15.4, 16.8, 18.4, 20.1],
  [18, 13.9, 15.1, 16.4, 17.9, 19.6],
  [24, 13.9, 15.1, 16.4, 17.8, 19.5],
  [36, 13.7, 14.8, 15.9, 17.3, 18.9],
  [48, 13.5, 14.6, 15.8, 17.3, 19.1],
  [60, 13.3, 14.4, 15.7, 17.3, 19.3],
]

const TABLES: Record<Sex, Record<GrowthMetric, Row[]>> = {
  M: { weight: WEIGHT_M, height: HEIGHT_M, head_circumference: HC_M, bmi: BMI_M },
  F: { weight: WEIGHT_F, height: HEIGHT_F, head_circumference: HC_F, bmi: BMI_F },
}

export const PERCENTILE_LABELS = ['P3', 'P15', 'P50', 'P85', 'P97'] as const

/** Valeurs de référence [P3,P15,P50,P85,P97] à un âge donné (mois), null au-delà de 5 ans. */
export function refAt(sex: Sex, metric: GrowthMetric, months: number): [number, number, number, number, number] | null {
  if (months < 0 || months > 60) return null
  const rows = TABLES[sex][metric]
  let lo = rows[0], hi = rows[rows.length - 1]
  for (let i = 0; i < rows.length - 1; i++) {
    if (months >= rows[i][0] && months <= rows[i + 1][0]) { lo = rows[i]; hi = rows[i + 1]; break }
  }
  const t = hi[0] === lo[0] ? 0 : (months - lo[0]) / (hi[0] - lo[0])
  return [1, 2, 3, 4, 5].map((k) => lo[k] + (hi[k] - lo[k]) * t) as [number, number, number, number, number]
}

/** Couloir dans lequel tombe une mesure : 0 = < P3 … 5 = > P97. */
export function corridor(sex: Sex, metric: GrowthMetric, months: number, value: number): number | null {
  const ref = refAt(sex, metric, months)
  if (!ref) return null
  if (value < ref[0]) return 0
  if (value < ref[1]) return 1
  if (value < ref[2]) return 2
  if (value < ref[3]) return 3
  if (value < ref[4]) return 4
  return 5
}

export interface GrowthAlert { type: 'rupture' | 'hors-couloir'; message: string }

/** Détecte les ruptures de courbe (croisement de ≥ 2 couloirs entre 2 mesures)
 *  et les mesures hors couloirs (< P3 ou > P97). */
export function detectAlerts(sex: Sex, metric: GrowthMetric, pts: { x: number; y: number }[], label: string): GrowthAlert[] {
  const alerts: GrowthAlert[] = []
  const cs = pts.map((p) => corridor(sex, metric, p.x, p.y))
  for (let i = 1; i < pts.length; i++) {
    const a = cs[i - 1], b = cs[i]
    if (a != null && b != null && Math.abs(b - a) >= 2) {
      alerts.push({ type: 'rupture', message: `Rupture de courbe (${label}) : changement de ${Math.abs(b - a)} couloirs entre 2 mesures.` })
      break // une seule alerte de rupture suffit
    }
  }
  const last = pts[pts.length - 1]
  const lastC = cs[cs.length - 1]
  if (last && lastC === 0) alerts.push({ type: 'hors-couloir', message: `Dernière mesure de ${label} sous le P3 (−2 DS).` })
  if (last && lastC === 5) alerts.push({ type: 'hors-couloir', message: `Dernière mesure de ${label} au-dessus du P97 (+2 DS).` })
  return alerts
}
