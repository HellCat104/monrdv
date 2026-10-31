// Le schéma dentaire des formulaires de remboursement.
//
// Les trois formulaires qui en portent un — CNSS, CNOPS, RMA — demandent la
// même chose, dans les mêmes mots : « Le praticien est prié de préciser la
// dent traitée ». Jusqu'ici le praticien entourait la dent au stylo. Ici elle
// est déjà entourée, à partir des actes cochés.
//
// ── LA CONVENTION DU FORMULAIRE ─────────────────────────────────────────────
//
// Les imprimés ne numérotent pas les dents comme MonRDV. Ils posent deux axes
// — H en haut, B en bas, D à GAUCHE du dessin, G à DROITE — et numérotent de
// 1 à 8 depuis le milieu, dans chaque quadrant. D et G sont la droite et la
// gauche DU PATIENT : on le regarde en face, donc sa droite est à notre
// gauche. C'est la convention de tous les odontogrammes, et l'inverser
// mettrait une couronne du mauvais côté de la bouche sur un document opposable.
//
// La correspondance avec les numéros FDI de MonRDV :
//
//   quadrant 1 (11→18) = haut droite  → en haut à GAUCHE du dessin
//   quadrant 2 (21→28) = haut gauche  → en haut à DROITE
//   quadrant 3 (31→38) = bas gauche   → en bas à DROITE
//   quadrant 4 (41→48) = bas droite   → en bas à GAUCHE
//
// et pour les dents de lait, les quadrants 5, 6, 7, 8 dans le même ordre, avec
// cinq positions au lieu de huit.

interface Props {
  /** Dents traitées, en numérotation FDI (« 36 », « 11 », « 74 »). */
  dents: string[]
  /** Largeur en pixels du dessin imprimé. */
  largeur?: number
}

/** Quadrant et rang d'un numéro FDI. Rend null pour tout ce qui n'en est pas
 *  un : une case « dent » laissée libre ne doit pas noircir une dent au hasard. */
function position(fdi: string): { quadrant: number; rang: number } | null {
  const m = /^([1-8])([1-8])$/.exec(String(fdi ?? '').trim())
  if (!m) return null
  const quadrant = Number(m[1])
  const rang = Number(m[2])
  // Les quadrants de lait n'ont que cinq dents.
  if (quadrant >= 5 && rang > 5) return null
  return { quadrant, rang }
}

/** Un quadrant est-il en haut ? à gauche du dessin ? */
const EN_HAUT = new Set([1, 2, 5, 6])
const A_GAUCHE_DU_DESSIN = new Set([1, 4, 5, 8]) // la droite du patient

export default function SchemaDentaireFormulaire({ dents, largeur = 220 }: Props) {
  const marquees = new Set(
    dents.map((d) => String(d ?? '').trim()).filter((d) => position(d) !== null),
  )
  const lait = Array.from(marquees).some((d) => Number(d[0]) >= 5)

  const W = largeur
  const H = Math.round(largeur * 1.15)
  const cx = W / 2
  const cy = H / 2
  const rxP = W * 0.40
  const ryP = H * 0.38
  const rxL = W * 0.23
  const ryL = H * 0.20
  const r = Math.max(6.5, W * 0.035)

  /** Centre d'une dent sur son arc.
   *
   *  Les dents se répartissent sur un demi-arc, du milieu vers le fond. Le
   *  rang 1 est au milieu (90° en haut, 270° en bas), le rang le plus élevé
   *  au fond de la bouche. */
  function centre(quadrant: number, rang: number, total: number) {
    const gauche = A_GAUCHE_DU_DESSIN.has(quadrant)
    const haut = EN_HAUT.has(quadrant)
    const rx = quadrant >= 5 ? rxL : rxP
    const ry = quadrant >= 5 ? ryL : ryP
    // De 90° (milieu) vers 180° à gauche, vers 0° à droite.
    const ecart = ((rang - 0.5) / total) * 90
    const angle = gauche ? 90 + ecart : 90 - ecart
    const rad = (angle * Math.PI) / 180
    // Au-delà de 90°, le cosinus est négatif : il place de lui-même la dent à
    // gauche du dessin. Rien à inverser à la main.
    return {
      x: cx + rx * Math.cos(rad),
      y: cy + (haut ? -1 : 1) * ry * Math.sin(rad),
    }
  }

  const dessins: { cle: string; x: number; y: number; rang: number; marquee: boolean; petite: boolean }[] = []
  for (const quadrant of [1, 2, 3, 4]) {
    for (let rang = 1; rang <= 8; rang++) {
      const p = centre(quadrant, rang, 8)
      const cle = `${quadrant}${rang}`
      dessins.push({ cle, x: p.x, y: p.y, rang, marquee: marquees.has(cle), petite: false })
    }
  }
  if (lait) {
    for (const quadrant of [5, 6, 7, 8]) {
      for (let rang = 1; rang <= 5; rang++) {
        const p = centre(quadrant, rang, 5)
        const cle = `${quadrant}${rang}`
        dessins.push({ cle, x: p.x, y: p.y, rang, marquee: marquees.has(cle), petite: true })
      }
    }
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto" aria-label="Schéma dentaire">
      {/* Les deux axes du formulaire. */}
      <line x1={cx} y1={8} x2={cx} y2={H - 8} stroke="#111" strokeWidth={1} />
      <line x1={10} y1={cy} x2={W - 10} y2={cy} stroke="#111" strokeWidth={1} />
      <text x={cx} y={7} textAnchor="middle" fontSize={11} fontWeight={700} fill="#111">H</text>
      <text x={cx} y={H - 1} textAnchor="middle" fontSize={11} fontWeight={700} fill="#111">B</text>
      <text x={4} y={cy + 4} fontSize={11} fontWeight={700} fill="#111">D</text>
      <text x={W - 11} y={cy + 4} fontSize={11} fontWeight={700} fill="#111">G</text>

      {dessins.map((d) => {
        const rr = d.petite ? r * 0.72 : r
        return (
          <g key={d.cle}>
            <circle
              cx={d.x} cy={d.y} r={rr}
              fill={d.marquee ? '#111' : '#fff'}
              stroke="#111"
              strokeWidth={d.marquee ? 1.2 : 0.7}
            />
            <text
              x={d.x} y={d.y + rr * 0.36}
              textAnchor="middle"
              fontSize={rr * 0.95}
              fill={d.marquee ? '#fff' : '#333'}
              fontWeight={d.marquee ? 700 : 400}
            >
              {d.rang}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
