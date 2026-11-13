// Le DESSIN d'une dent — sa couronne, ses racines, et ce qu'on y a fait.
//
// ── POURQUOI DESSINER ───────────────────────────────────────────────────────
//
// Le schéma dentaire était une rangée de cases numérotées. Un praticien ne
// pense pas en cases : il pense « la 46, une molaire, traitée par la racine et
// couronnée ». Une case peinte en bleu ne dit ni que c'est une molaire, ni
// que le soin est dans la racine. Il fallait lire la légende, puis ouvrir la
// dent.
//
// Un vrai schéma se lit comme une radio panoramique : la forme dit quelle
// dent, et l'ENDROIT coloré dit ce qu'on y a fait.
//
// ── CE QUE LA COULEUR DIT, ET OÙ ────────────────────────────────────────────
//
//   la COURONNE colorée  → ce qui touche la partie visible : carie, fracture,
//                          obturation, couronne, bridge
//   la RACINE colorée    → le traitement de racine
//   une VIS à la place   → l'implant
//     de la racine
//   toute la dent        → à extraire
//   le CONTOUR coloré    → la mobilité (la dent bouge, elle n'est pas abîmée)
//   un fantôme barré     → absente ou extraite
//
// Une dent dévitalisée ET couronnée montre donc ses deux soins à la fois,
// chacun à sa place — ce qu'une case d'une seule couleur ne pouvait pas faire.
//
// Les couleurs sont celles de lib/dental.ts : la légende n'a pas changé.
//
// ── LES FORMES ──────────────────────────────────────────────────────────────
//
// Quatre silhouettes, vues de face : incisive, canine, prémolaire, molaire.
// Elles sont dessinées racine en haut (une dent du HAUT) et retournées pour
// l'arcade du bas. Les dents de lait reprennent les mêmes, en plus petit : une
// molaire de lait est une molaire.
//
// Ce sont des silhouettes de repérage, pas des planches d'anatomie : la
// première prémolaire du haut a deux racines, on n'en dessine qu'une. Ce qui
// compte, c'est qu'on reconnaisse la dent du premier coup d'œil.
import { DENTAL_COLOR, type ToothStatus } from '@/lib/dental'

type Forme = 'incisive' | 'canine' | 'premolaire' | 'molaire'

/** La forme d'une dent d'après son numéro FDI. Le chiffre des unités donne la
 *  position dans l'hémi-arcade ; celui des dizaines, le quadrant — 1 à 4 pour
 *  les définitives, 5 à 8 pour les dents de lait, qui n'ont pas de prémolaires :
 *  leurs positions 4 et 5 sont des molaires. */
export function formeDeLaDent(numero: number): Forme {
  const position = numero % 10
  const lait = Math.floor(numero / 10) >= 5
  if (position <= 2) return 'incisive'
  if (position === 3) return 'canine'
  if (lait) return 'molaire'
  return position <= 5 ? 'premolaire' : 'molaire'
}

/** Une dent du haut ? Quadrants 1 et 2 (définitives), 5 et 6 (lait). */
export function dentDuHaut(numero: number): boolean {
  const q = Math.floor(numero / 10)
  return q === 1 || q === 2 || q === 5 || q === 6
}

// Tracés dans un cadre de 32 × 52, racine en haut. `collet` = la ligne où la
// couronne rejoint la racine : les deux tracés la partagent, pour qu'aucun
// jour n'apparaisse entre eux.
const TRACES: Record<Forme, { racine: string; couronne: string; collet: number }> = {
  incisive: {
    collet: 27,
    racine: 'M10.5 27C10.5 17 13 8 16 3C19 8 21.5 17 21.5 27Z',
    couronne: 'M10 27L22 27C25 31 27 39 26 46Q25.5 50 22 50L10 50Q6.5 50 6 46C5 39 7 31 10 27Z',
  },
  canine: {
    collet: 26,
    racine: 'M10.5 26C10.5 16 13 6 16 1C19 6 21.5 16 21.5 26Z',
    couronne: 'M10 26L22 26C25 30 27 36 26 41Q22 47 16 50.5Q10 47 6 41C5 36 7 30 10 26Z',
  },
  premolaire: {
    collet: 26,
    racine: 'M10.5 26C11 17 13 9 16 4C19 9 21 17 21.5 26Z',
    couronne: 'M10 26L22 26C26 29 28 35 27 42Q26 50 21 49Q16 45.5 11 49Q6 50 5 42C4 35 6 29 10 26Z',
  },
  molaire: {
    collet: 26,
    racine: 'M5.5 26C4.5 18 5 10 8 4C10 10 11 16 12.5 21Q16 23.5 19.5 21C21 16 22 10 24 4C27 10 27.5 18 26.5 26Z',
    couronne: 'M5 26L27 26C30 29 31 36 30 43Q29 50 24 49Q20 46 16 49Q12 46 8 49Q3 50 2 43C1 36 2 29 5 26Z',
  },
}

/** Ce qui touche la couronne, du plus pressant au plus ancien : une dent
 *  couronnée qui se fracture doit montrer la fracture. */
const SUR_LA_COURONNE: ToothStatus[] = ['fracture', 'carie', 'couronne', 'bridge', 'obturation']

export interface LectureDent {
  extraite: boolean
  couronne: string | null
  racine: string | null
  implant: boolean
  contour: string | null
  /** Les états que le dessin ne montre PAS : une dent cariée et déjà obturée
   *  n'a qu'une couronne à colorer. Le schéma les signale à côté, en pastilles. */
  nonMontres: ToothStatus[]
}

/** Ce que le dessin doit montrer pour ces états, et ce qu'il laisse de côté. */
export function lireDent(etats: ToothStatus[]): LectureDent {
  if (etats.includes('extraite')) {
    return { extraite: true, couronne: null, racine: null, implant: false, contour: null, nonMontres: [] }
  }
  const montres = new Set<ToothStatus>()
  let couronne: string | null = null
  let racine: string | null = null

  const etatCouronne = SUR_LA_COURONNE.find((e) => etats.includes(e))
  if (etatCouronne) { couronne = DENTAL_COLOR[etatCouronne]; montres.add(etatCouronne) }

  const implant = etats.includes('implant')
  if (implant) { racine = DENTAL_COLOR.implant; montres.add('implant') }
  else if (etats.includes('endodontie')) { racine = DENTAL_COLOR.endodontie; montres.add('endodontie') }

  // « À extraire » prend toute la dent : c'est la décision qui l'emporte sur
  // tout ce qu'on y a fait avant.
  if (etats.includes('a_extraire')) {
    couronne = DENTAL_COLOR.a_extraire
    if (!implant) racine = DENTAL_COLOR.a_extraire
    montres.add('a_extraire')
  }

  let contour: string | null = null
  if (etats.includes('mobilite')) { contour = DENTAL_COLOR.mobilite; montres.add('mobilite') }

  return {
    extraite: false, couronne, racine, implant, contour,
    nonMontres: etats.filter((e) => !montres.has(e)),
  }
}

const TRAIT = '#94a3b8' // le contour d'une dent saine
const FANTOME = '#cbd5e1'
const PLANIFIE = '#334155' // le contour d'une dent où il reste un geste à faire

export default function DessinDent({ numero, etats, planifie = false }: {
  numero: number
  etats: ToothStatus[]
  /** Un geste reste à faire sur cette dent : le contour passe en pointillés. */
  planifie?: boolean
}) {
  const forme = formeDeLaDent(numero)
  const { racine: tRacine, couronne: tCouronne, collet } = TRACES[forme]
  const lu = lireDent(etats)
  const haut = dentDuHaut(numero)
  const lait = Math.floor(numero / 10) >= 5

  const contour = lu.contour ?? (lu.couronne && lu.couronne === lu.racine ? lu.couronne : TRAIT)
  const epaisseur = planifie ? 1.6 : lu.contour ? 2 : 1.2
  const pointilles = planifie ? '3 2' : undefined
  // « À faire » : le contour passe en pointillés SOMBRES. Tracé dans la
  // couleur du soin, il se confondait avec la couronne colorée et ne se
  // voyait plus du tout — vérifié sur le rendu avant la mise en ligne.
  const trait = (couleur: string | null) => (planifie ? PLANIFIE : couleur ?? contour)

  // Une dent du bas est la même, retournée. Une dent de lait est la même, plus
  // petite — réduite vers la ligne où les deux arcades se rencontrent, pour
  // que toutes les couronnes restent alignées.
  const transformations = [
    haut ? '' : 'translate(0 52) scale(1 -1)',
    lait ? 'translate(16 52) scale(0.82) translate(-16 -52)' : '',
  ].filter(Boolean).join(' ')

  return (
    <svg viewBox="0 0 32 52" className="block w-full h-auto" aria-hidden="true">
      <g transform={transformations || undefined} strokeLinejoin="round" strokeLinecap="round">
        {lu.extraite ? (
          <>
            {/* La dent n'est plus là : on garde sa place, en fantôme, pour que
                l'arcade ne se resserre pas et que le trou se voie. */}
            <path d={tRacine} fill="none" stroke={FANTOME} strokeWidth="1" strokeDasharray="2 2" />
            <path d={tCouronne} fill="none" stroke={FANTOME} strokeWidth="1" strokeDasharray="2 2" />
            <path d="M8 30L24 46M24 30L8 46" stroke={DENTAL_COLOR.extraite} strokeWidth="1.6" fill="none" />
          </>
        ) : (
          <>
            {lu.implant ? (
              <>
                {/* L'implant : une vis à la place de la racine. */}
                <path d={`M12.5 ${collet}L19.5 ${collet}L18.5 6Q16 3 13.5 6Z`}
                  fill={DENTAL_COLOR.implant} stroke={DENTAL_COLOR.implant} strokeWidth="1" />
                <path d="M12.3 21H19.7M12.6 16H19.4M12.9 11H19.1" stroke="#fff" strokeWidth="1" fill="none" />
              </>
            ) : (
              <path d={tRacine} fill={lu.racine ?? '#fff'} stroke={trait(lu.racine)}
                strokeWidth={epaisseur} strokeDasharray={pointilles} />
            )}
            <path d={tCouronne} fill={lu.couronne ?? '#fff'} stroke={trait(lu.couronne)}
              strokeWidth={epaisseur} strokeDasharray={pointilles} />
            {/* Mobilité : le contour seul est coloré, la dent reste blanche. */}
            {lu.contour && !lu.couronne && !planifie && (
              <path d={tCouronne} fill="none" stroke={lu.contour} strokeWidth="2" />
            )}
          </>
        )}
      </g>
    </svg>
  )
}
