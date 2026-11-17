// La dent VUE DE DESSUS — sa face de mastication, et ses cinq faces.
//
// ── POURQUOI UNE SECONDE VUE ────────────────────────────────────────────────
//
// Le dessin de profil (DessinDent) montre la couronne et les racines : un
// traitement de racine, un implant, une couronne s'y lisent d'un coup. Mais
// une carie « mésio-occlusale » ou un composite « disto-vestibulaire » ne se
// voient bien que d'en haut, là où les cinq faces de la dent sont côte à côte.
// Les logiciels installés dans les cabinets montrent les deux vues, l'une
// au-dessus de l'autre : c'est ce que le dentiste a l'habitude de lire.
//
// ── LES CINQ FACES ──────────────────────────────────────────────────────────
//
//   O occlusale   au centre (le bord libre, pour une incisive)
//   V vestibulaire côté joue ou lèvre — vers l'EXTÉRIEUR de l'arcade : en
//                  haut pour une dent du haut, en bas pour une dent du bas
//   P palatine    côté langue ou palais — vers l'intérieur
//   M mésiale     vers le milieu de la bouche
//   D distale     vers le fond
//
// Une carie notée sur M et O se colore exactement là. Sans face notée, elle
// se pose au centre. Une couronne, un implant, une dent à extraire teintent
// la dent entière ; une dent absente n'est plus qu'un contour fantôme.
import { useId } from 'react'
import { DENTAL_COLOR, type ToothFace, type ToothStatus } from '@/lib/dental'
import { dentDuHaut, formeDeLaDent } from '@/components/dashboard/DessinDent'

type Forme = ReturnType<typeof formeDeLaDent>

/** Le contour de la face de mastication, dans une boîte de 40 × 34. */
const CONTOURS: Record<Forme, { d: string; boite: [number, number, number, number]; centre: [number, number, number, number] }> = {
  // Une molaire : presque carrée, quatre cuspides arrondies.
  molaire: {
    d: 'M8 4Q20 1 32 4Q37 6 37 12L37 22Q37 28 32 30Q20 33 8 30Q3 28 3 22L3 12Q3 6 8 4Z',
    boite: [3, 2, 37, 32],
    centre: [12, 10, 28, 24],
  },
  // Une prémolaire : ovale, deux cuspides de part et d'autre d'un sillon.
  premolaire: {
    d: 'M20 3Q31 3 33 11L33 23Q31 31 20 31Q9 31 7 23L7 11Q9 3 20 3Z',
    boite: [7, 3, 33, 31],
    centre: [13, 11, 27, 23],
  },
  // Une canine : un losange arrondi, une seule pointe.
  canine: {
    d: 'M20 4Q27 7 33 15Q34 17 33 19Q27 27 20 30Q13 27 7 19Q6 17 7 15Q13 7 20 4Z',
    boite: [6, 4, 34, 30],
    centre: [15, 13, 25, 21],
  },
  // Une incisive : un bord tranchant, large et fin.
  incisive: {
    d: 'M6 13Q8 7 20 7Q32 7 34 13Q35 18 33 21Q28 27 20 27Q12 27 7 21Q5 18 6 13Z',
    boite: [5, 7, 35, 27],
    centre: [10, 15, 30, 19],
  },
}

/** Les sillons dessinés sur la face de mastication. */
const SILLONS: Record<Forme, string> = {
  molaire: 'M11 17L29 17M20 9L20 25M11 17L8 11M29 17L32 11M11 17L8 23M29 17L32 23',
  premolaire: 'M11 17Q20 14 29 17M14 13L11 10M26 13L29 10',
  canine: 'M20 8L20 26M12 17L28 17',
  incisive: 'M9 17Q20 15.5 31 17',
}

/** Ce qui recouvre toute la dent, dans l'ordre où cela l'emporte. */
const TOUTE_LA_DENT: ToothStatus[] = ['a_extraire', 'implant', 'bridge', 'couronne', 'prothese_amovible']
/** Ce qui se pose sur une face. */
const SUR_UNE_FACE: ToothStatus[] = ['carie', 'obturation', 'inlay', 'facette']

export default function DentDessus({ numero, etats, faces, planifie = false, facesChoisies, selectionnable = false }: {
  numero: number
  etats: ToothStatus[]
  faces?: Partial<Record<ToothStatus, ToothFace[]>>
  planifie?: boolean
  /** Les faces sélectionnées pour un acte : surlignées en bleu. */
  facesChoisies?: string[]
  /** Chaque face devient une zone cliquable (attribut `data-face`), que le
   *  schéma lit pour savoir QUELLE face a été touchée. */
  selectionnable?: boolean
}) {
  const p = `o${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const forme = formeDeLaDent(numero)
  const { d, boite, centre } = CONTOURS[forme]
  const [x0, y0, x1, y1] = boite
  const [cx0, cy0, cx1, cy1] = centre
  const haut = dentDuHaut(numero)
  const q = Math.floor(numero / 10)
  const lait = q >= 5
  // Le milieu de la bouche est à DROITE de l'écran pour les dents de la
  // droite du patient (quadrants 1, 4, 5, 8) — vue du praticien.
  const mesialADroite = q === 1 || q === 4 || q === 5 || q === 8

  const extraite = etats.includes('extraite')
  const incluse = etats.includes('incluse')

  // Les cinq zones, du bord de la boîte au carré central.
  const zone: Record<ToothFace, string> = {
    O: `M${cx0} ${cy0}H${cx1}V${cy1}H${cx0}Z`,
    V: haut ? `M${x0} ${y0}H${x1}L${cx1} ${cy0}H${cx0}Z` : `M${x0} ${y1}H${x1}L${cx1} ${cy1}H${cx0}Z`,
    P: haut ? `M${x0} ${y1}H${x1}L${cx1} ${cy1}H${cx0}Z` : `M${x0} ${y0}H${x1}L${cx1} ${cy0}H${cx0}Z`,
    M: mesialADroite ? `M${x1} ${y0}V${y1}L${cx1} ${cy1}V${cy0}Z` : `M${x0} ${y0}V${y1}L${cx0} ${cy1}V${cy0}Z`,
    D: mesialADroite ? `M${x0} ${y0}V${y1}L${cx0} ${cy1}V${cy0}Z` : `M${x1} ${y0}V${y1}L${cx1} ${cy1}V${cy0}Z`,
  }

  const fond = TOUTE_LA_DENT.find((e) => etats.includes(e))
  const taches = SUR_UNE_FACE.filter((e) => etats.includes(e)).flatMap((e) => {
    const fs = (faces?.[e] ?? []).filter((f): f is ToothFace => f in zone)
    // Sans face notée : la facette couvre la face visible, le reste se pose
    // au centre.
    const ou: ToothFace[] = fs.length > 0 ? fs : [e === 'facette' ? 'V' : 'O']
    return ou.map((f) => ({ etat: e, face: f }))
  })

  const transformation = lait ? 'translate(20 17) scale(0.8) translate(-20 -17)' : undefined

  if (extraite) {
    return (
      <svg viewBox="0 0 40 34" className="block w-full h-auto" aria-hidden="true">
        <g transform={transformation}>
          <path d={d} fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 1.5" />
          <path d="M13 10L27 24M27 10L13 24" stroke="#94a3b8" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 40 34" className="block w-full h-auto" aria-hidden="true">
      <defs>
        <clipPath id={`${p}c`}><path d={d} /></clipPath>
        {/* L'émail vu d'en haut : nacré au centre, plus gris sur les bords. */}
        <radialGradient id={`${p}e`} cx="0.45" cy="0.42" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f3f5f8" />
          <stop offset="1" stopColor="#c9d1dc" />
        </radialGradient>
        {/* Le relief, posé par-dessus la couleur. */}
        <radialGradient id={`${p}v`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#1e293b" stopOpacity="0.18" />
        </radialGradient>
      </defs>
      <g transform={transformation} opacity={incluse ? 0.45 : 1}>
        <path d={d} fill={`url(#${p}e)`} />
        <g clipPath={`url(#${p}c)`}>
          {fond && <path d={d} fill={DENTAL_COLOR[fond]} fillOpacity={fond === 'a_extraire' ? 0.75 : 0.9} />}
          {taches.map(({ etat, face }) => (
            <path key={`${etat}-${face}`} d={zone[face]} fill={DENTAL_COLOR[etat]} fillOpacity={0.92} />
          ))}
          <path d={SILLONS[forme]} fill="none"
            stroke={etats.includes('scellement') ? DENTAL_COLOR.scellement : '#94a3b8'}
            strokeWidth={etats.includes('scellement') ? 1.6 : 0.6} strokeLinecap="round" strokeOpacity={0.8} />
          {etats.includes('endodontie') && !etats.includes('implant') && (
            <circle cx={20} cy={17} r={2.6} fill={DENTAL_COLOR.endodontie} stroke="#0e7490" strokeWidth={0.5} />
          )}
          {etats.includes('implant') && (
            <circle cx={20} cy={17} r={4} fill="none" stroke="#ffffff" strokeWidth={1.2} strokeDasharray="1.5 1" />
          )}
          {etats.includes('fracture') && (
            <path d={`M${x0} ${y0 + 9}L${x0 + 9} ${y0 + 14}L${x0 + 15} ${y0 + 10}L${x0 + 22} ${y0 + 18}L${x1} ${y0 + 15}`}
              fill="none" stroke={DENTAL_COLOR.fracture} strokeWidth={1.3} strokeLinejoin="round" />
          )}
          <path d={d} fill={`url(#${p}v)`} />
          {/* Les faces choisies pour l'acte en cours. */}
          {(facesChoisies ?? []).filter((f): f is ToothFace => f in zone).map((f) => (
            <path key={`choix-${f}`} d={zone[f]} fill="#0ea5e9" fillOpacity={0.55} stroke="#0369a1" strokeWidth={0.8} />
          ))}
          {/* Les cinq zones à toucher, invisibles, par-dessus tout le reste. */}
          {selectionnable && (Object.keys(zone) as ToothFace[]).map((f) => (
            <path key={`zone-${f}`} d={zone[f]} data-face={f} fill="transparent" stroke="none"
              className="cursor-pointer hover:fill-sky-400/25">
              <title>{({ O: 'Occlusale', V: 'Vestibulaire', P: 'Palatine / linguale', M: 'Mésiale', D: 'Distale' } as const)[f]}</title>
            </path>
          ))}
        </g>
        <path d={d} fill="none"
          stroke={planifie ? '#334155' : incluse ? '#94a3b8' : '#8d99a8'}
          strokeWidth={planifie ? 1.3 : 0.8}
          strokeDasharray={planifie || incluse ? '2.2 1.4' : undefined} />
      </g>
    </svg>
  )
}
