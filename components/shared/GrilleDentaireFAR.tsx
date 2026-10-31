// La grille dentaire de la Mutuelle des FAR.
//
// Les trois autres imprimés — CNSS, CNOPS, RMA — dessinent une arcade et
// demandent d'entourer la dent (voir SchemaDentaireFormulaire). Celui des FAR
// fait autrement : une grille de NUMÉROS, en notation FDI, et deux gestes
// distincts que le formulaire énonce lui-même :
//
//   « Le praticien met une croix sur la dent objet de la prothèse ou de
//     l'extraction. »
//   « Il encercle la dent soignée ou couronnée. »
//
// Deux gestes, donc deux marques, et pas une seule « dent traitée » : une
// couronne entourée et une extraction croisée ne disent pas la même chose au
// contrôle médical de la mutuelle.
//
// La disposition est celle de l'imprimé : les dents de lait au-dessus et
// au-dessous des permanentes, décalées de trois colonnes puisqu'elles sont
// cinq par quadrant contre huit.

interface Props {
  /** Dents extraites ou appareillées — croisées. */
  croix: string[]
  /** Dents soignées ou couronnées — entourées. */
  cercles: string[]
  /** Côté d'une case, en pixels. */
  cote?: number
}

/** Les quatre rangées de l'imprimé, de haut en bas.
 *
 *  `retrait` est le nombre de cases vides à gauche : les rangées de lait sont
 *  cinq par quadrant contre huit, et l'imprimé les centre sur les permanentes.
 *  Ces vides sont de VRAIES cases, posées une à une, et non un décalage confié
 *  au placement automatique de la grille — sur un document imprimé, une dent
 *  qui glisse d'une colonne désigne la voisine. */
const COLONNES = 16
const RANGEES: { retrait: number; dents: number[] }[] = [
  { retrait: 3, dents: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65] },
  { retrait: 0, dents: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] },
  { retrait: 0, dents: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] },
  { retrait: 3, dents: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75] },
]

export default function GrilleDentaireFAR({ croix, cercles, cote = 22 }: Props) {
  const propre = (l: string[]) => new Set(l.map((d) => String(d ?? '').trim()).filter(Boolean))
  const croisees = propre(croix)
  const entourees = propre(cercles)

  return (
    <div
      className="inline-grid gap-0"
      style={{ gridTemplateColumns: `repeat(${COLONNES}, ${cote}px)` }}
      aria-label="Grille dentaire"
    >
      {RANGEES.flatMap((rangee, r) => [
        // Les cases vides de part et d'autre, qui centrent les dents de lait.
        ...Array.from({ length: rangee.retrait }).map((_, i) => (
          <span key={`g${r}-${i}`} style={{ width: cote, height: cote }} />
        )),
        ...rangee.dents.map((n) => {
          const cle = String(n)
          const croisee = croisees.has(cle)
          // Une dent croisée ET entourée reste croisée : c'est le geste le
          // plus fort des deux, et la mutuelle lit d'abord l'extraction.
          const entouree = !croisee && entourees.has(cle)
          return (
            <div
              key={`${r}-${cle}`}
              className="relative border border-gray-700 flex items-center justify-center"
              style={{ width: cote, height: cote }}
            >
              <span
                className={`text-[9px] leading-none tabular-nums ${entouree ? 'font-bold' : ''}`}
              >
                {cle}
              </span>
              {entouree && (
                <span
                  className="absolute rounded-full border border-gray-900"
                  style={{ inset: 1.5 }}
                />
              )}
              {croisee && (
                <svg
                  className="absolute inset-0"
                  width={cote}
                  height={cote}
                  viewBox={`0 0 ${cote} ${cote}`}
                  aria-hidden
                >
                  <line x1={2} y1={2} x2={cote - 2} y2={cote - 2} stroke="#111" strokeWidth={1.2} />
                  <line x1={cote - 2} y1={2} x2={2} y2={cote - 2} stroke="#111" strokeWidth={1.2} />
                </svg>
              )}
            </div>
          )
        }),
        ...Array.from({ length: COLONNES - rangee.retrait - rangee.dents.length }).map((_, i) => (
          <span key={`d${r}-${i}`} style={{ width: cote, height: cote }} />
        )),
      ])}
    </div>
  )
}
