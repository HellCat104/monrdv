// Les deux arcades vues d'en haut, pour choisir des dents d'un clic.
//
// C'est le schéma que le dentiste a sur ses fiches papier : le maxillaire en
// fer à cheval en haut, la mandibule en dessous, les dents de lait à
// l'intérieur. Dans la fenêtre « Ajouter un acte », il sert à corriger la
// sélection faite sur le schéma — ajouter la voisine oubliée, retirer une
// dent touchée par erreur — sans refermer la fenêtre.
import { FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT } from '@/lib/dental'

const CX = 150

/** Les positions des dents d'une arcade, de la droite du patient (à gauche de
 *  l'écran) à sa gauche. `haut` : le fer à cheval s'ouvre vers le bas. */
function positions(ids: number[], cy: number, rx: number, ry: number, haut: boolean) {
  const n = ids.length
  return ids.map((id, i) => {
    // Un peu moins qu'un demi-tour : les molaires ne sont pas à
    // l'horizontale de la ligne médiane, elles redescendent en arrière.
    const angle = Math.PI * (1.02 - 1.04 * (i / (n - 1)))
    return {
      id: String(id),
      x: CX + rx * Math.cos(angle),
      y: haut ? cy - ry * Math.sin(angle) : cy + ry * Math.sin(angle),
    }
  })
}

const ARCADES = [
  { dents: positions(FDI_UPPER, 140, 118, 112, true), r: 11 },
  { dents: positions(FDI_UPPER_LAIT, 140, 62, 60, true), r: 8.5 },
  { dents: positions(FDI_LOWER_LAIT, 228, 62, 60, false), r: 8.5 },
  { dents: positions(FDI_LOWER, 228, 118, 112, false), r: 11 },
]

export default function ArcadeSelecteur({ choisies, onBasculer, lait = true }: {
  choisies: string[]
  onBasculer: (dent: string) => void
  /** Montrer les dents de lait (au centre). */
  lait?: boolean
}) {
  return (
    <svg viewBox="0 0 300 354" className="w-full h-auto max-h-[420px] select-none" role="group" aria-label="Choisir les dents">
      <text x={CX} y={187} textAnchor="middle" className="fill-gray-300" fontSize={8} letterSpacing={2}>
        MAXILLAIRE ↑ · ↓ MANDIBULE
      </text>
      <text x={8} y={187} className="fill-gray-300" fontSize={7.5}>Droite</text>
      <text x={292} y={187} textAnchor="end" className="fill-gray-300" fontSize={7.5}>Gauche</text>
      {ARCADES.filter((a) => lait || a.r > 10).map((a) => a.dents.map(({ id, x, y }) => {
        const on = choisies.includes(id)
        return (
          <g key={id} role="button" tabIndex={0} aria-pressed={on} aria-label={`Dent ${id}`}
            onClick={() => onBasculer(id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBasculer(id) } }}
            className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-sky-600">
            <circle cx={x} cy={y} r={a.r}
              className={on ? 'fill-sky-500 stroke-sky-700' : 'fill-white stroke-gray-300 hover:fill-sky-50'}
              strokeWidth={on ? 1.5 : 1} />
            <text x={x} y={y + 3} textAnchor="middle" fontSize={a.r > 10 ? 8.5 : 7}
              className={`pointer-events-none font-semibold ${on ? 'fill-white' : 'fill-gray-600'}`}>
              {id}
            </text>
          </g>
        )
      }))}
    </svg>
  )
}
