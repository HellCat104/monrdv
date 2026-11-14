// Le DESSIN d'une dent — sa couronne, ses racines, et ce qu'on y a fait.
//
// ── POURQUOI DESSINER ───────────────────────────────────────────────────────
//
// Le schéma dentaire était une rangée de cases numérotées. Un praticien ne
// pense pas en cases : il pense « la 46, une molaire, traitée par la racine et
// couronnée ». Un vrai schéma se lit comme une radio panoramique : la forme dit
// quelle dent, et l'ENDROIT coloré dit ce qu'on y a fait.
//
// ── EN VOLUME (novembre 2026) ───────────────────────────────────────────────
//
// Les premières silhouettes étaient plates : un aplat blanc, un trait gris.
// Les logiciels dentaires installés dans les cabinets montrent des dents en
// relief — émail nacré, racines couleur dentine, une molaire du haut avec ses
// trois racines. À côté, un aplat fait « maquette ». D'où :
//
//   - l'émail : un dégradé radial blanc → gris bleuté sur les bords, un reflet
//     spéculaire, une teinte ivoire au collet ;
//   - la racine : un dégradé de cylindre (bords sombres, axe clair), plus
//     sombre vers l'apex, et l'ombre que la couronne porte sur elle ;
//   - la VRAIE anatomie des racines : une pour les incisives, canines et
//     prémolaires, deux pour la première prémolaire du haut, trois pour les
//     molaires du haut (la palatine, derrière), deux pour celles du bas ;
//   - des largeurs réelles : une incisive latérale est plus étroite qu'une
//     centrale, une incisive du bas plus étroite encore.
//
// Le volume est un CALQUE d'ombre posé par-dessus la couleur : une couronne
// prothétique, une dent à extraire gardent leur relief sans qu'il faille un
// dégradé par couleur.
//
// ── CE QUE LA COULEUR DIT, ET OÙ ────────────────────────────────────────────
//
//   une TACHE sur l'émail  → carie (rouge), obturation (bleu) — posée sur la
//                            FACE notée : occlusale au bord libre, mésiale ou
//                            distale sur le côté, vestibulaire au centre,
//                            palatine en transparence. L'émail autour reste
//                            blanc : c'est une dent soignée, pas une dent
//                            peinte.
//   un TRAIT brisé          → fracture
//   la COURONNE entière     → couronne prothétique, bridge (avec ses ponts
//                            vers les dents voisines)
//   les CANAUX dans la      → traitement de racine (le trait de la radio de
//     racine                  contrôle, là où le praticien l'attend)
//   une VIS à la place de   → implant
//     la racine
//   toute la dent           → à extraire
//   le CONTOUR + deux arcs  → mobilité (la dent bouge, elle n'est pas abîmée)
//   un fantôme barré        → absente ou extraite
//
// Une dent dévitalisée, obturée ET couronnée montre ses trois soins à la
// fois, chacun à sa place. Les couleurs sont celles de lib/dental.ts : la
// légende n'a pas changé.
//
// Les dents sont dessinées racine en haut (une dent du HAUT) et retournées
// pour l'arcade du bas. Une dent de lait reprend la forme de son homologue, en
// plus petit.
import { useId } from 'react'
import { DENTAL_COLOR, type ToothFace, type ToothStatus } from '@/lib/dental'

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

/** À l'écran (vue du praticien), les quadrants 1, 4, 5 et 8 sont à GAUCHE de
 *  la ligne médiane : leur face mésiale — tournée vers le milieu — est donc à
 *  droite du dessin. Pour les autres, à gauche. */
function mesialADroite(numero: number): boolean {
  const q = Math.floor(numero / 10)
  return q === 1 || q === 4 || q === 5 || q === 8
}

type Racines = 'une' | 'bifide' | 'trois' | 'deux'

/** Combien de racines, vues de face. */
function racinesDe(numero: number, forme: Forme): Racines {
  const position = numero % 10
  const haut = dentDuHaut(numero)
  const lait = Math.floor(numero / 10) >= 5
  if (forme === 'molaire') {
    // Les dents de sagesse ont souvent des racines fusionnées : deux, serrées.
    return haut && (lait || position <= 7) ? 'trois' : 'deux'
  }
  if (forme === 'premolaire' && haut && position === 4) return 'bifide'
  return 'une'
}

/** La largeur relative de la dent : une latérale est plus fine qu'une
 *  centrale, une incisive du bas plus fine encore, une dent de sagesse plus
 *  ramassée qu'une première molaire. */
function largeurDe(numero: number, forme: Forme): number {
  const position = numero % 10
  const haut = dentDuHaut(numero)
  const lait = Math.floor(numero / 10) >= 5
  if (lait) return forme === 'incisive' && !haut ? 0.8 : 1
  if (forme === 'incisive') return haut ? (position === 1 ? 1 : 0.86) : (position === 1 ? 0.72 : 0.78)
  if (forme === 'canine') return haut ? 1 : 0.92
  if (forme === 'premolaire') return 0.95
  return position === 6 ? 1 : position === 7 ? 0.95 : 0.9
}

// ── LES TRACÉS ──────────────────────────────────────────────────────────────
//
// Cadre de 40 × 80, racine en haut. `collet` = la jonction émail-cément ; la
// racine descend un peu sous la couronne pour qu'aucun jour n'apparaisse entre
// les deux. `boite` = l'étendue de la couronne, où l'on pose les taches.
interface Trace {
  couronne: string
  collet: number
  boite: { x0: number; x1: number; y0: number; y1: number }
  /** Un relief discret sur l'émail : sillon entre deux cuspides, lobes. */
  relief?: string
}

const TRACES: Record<Forme, Trace> = {
  incisive: {
    couronne: 'M13 42Q20 37.5 27 42C29.5 50 31.5 61 31 71Q30.5 77.5 25.5 78L14.5 78Q9.5 77.5 9 71C8.5 61 10.5 50 13 42Z',
    collet: 42,
    boite: { x0: 9, x1: 31, y0: 42, y1: 78 },
    relief: 'M16.2 52C15.6 60 15.6 68 16.3 75M23.8 52C24.4 60 24.4 68 23.7 75',
  },
  canine: {
    couronne: 'M13 41Q20 36.5 27 41C30 48 31.5 56 30.5 63Q29 68 25 72Q22 76 20 79Q18 76 15 72Q11 68 9.5 63C8.5 56 10 48 13 41Z',
    collet: 41,
    boite: { x0: 9.5, x1: 30.5, y0: 41, y1: 79 },
    relief: 'M20 47C19.6 58 19.7 68 20 76',
  },
  premolaire: {
    couronne: 'M12.5 45Q20 40.5 27.5 45C30.8 49.5 32.2 56 31.8 62Q31.4 67 28.5 70.5Q24 75.5 20 77.2Q16 75.5 11.5 70.5Q8.6 67 8.2 62C7.8 56 9.2 49.5 12.5 45Z',
    collet: 45,
    boite: { x0: 8.2, x1: 31.8, y0: 45, y1: 77.2 },
    relief: 'M20 50C19.7 60 19.8 68 20 75',
  },
  molaire: {
    couronne: 'M7 47Q20 42.5 33 47C35.5 52 36.5 59 35.5 66Q35 71 33.5 73.5Q31 77.8 26.5 77.3Q22.5 77 20 74.8Q17.5 77 13.5 77.3Q9 77.8 6.5 73.5Q5 71 4.5 66C3.5 59 4.5 52 7 47Z',
    collet: 47,
    boite: { x0: 4.5, x1: 35.5, y0: 47, y1: 77.5 },
    relief: 'M20 74.6C19.5 70.5 19.7 66.5 20.4 62.5',
  },
}

/** Les racines, et les canaux qu'un traitement de racine remplit. `arriere` =
 *  la racine palatine d'une molaire du haut, vue en transparence derrière. */
const RACINES: Record<Racines, { avant: string; arriere?: string; canaux: string }> = {
  une: {
    avant: 'M12.4 46C11.8 31 14.3 15 18.5 5Q20 2.5 21.5 5C25.7 15 28.2 31 27.6 46Z',
    canaux: 'M20 46C20 32 20 19 20 8',
  },
  bifide: {
    avant: 'M12.2 47C11.5 36 12.5 24 15 13Q16.2 10.5 17.5 13C18.3 18 19 22 20 25C21 22 21.7 18 22.5 13Q23.8 10.5 25 13C27.5 24 28.5 36 27.8 47Z',
    canaux: 'M18.3 47C17.8 35 17 24 16.3 14M21.7 47C22.2 35 23 24 23.7 14',
  },
  trois: {
    arriere: 'M15 41C15 28 17 16 19.5 6Q20.5 4.5 21.5 6C24 16 25.5 28 25.5 41Z',
    avant: 'M7.3 49C6 38 6.5 25 9.5 13Q11 10.5 12.5 13C13.5 21 14.5 28 16.5 33Q20 36.5 23.5 33C25.5 28 26.5 21 27.5 13Q29 10.5 30.5 13C33.5 25 34 38 32.7 49Z',
    canaux: 'M12.5 48C11 38 10.5 26 11 15M27.5 48C29 38 29.5 26 29 15M20 40V9',
  },
  deux: {
    avant: 'M7.3 49C6.5 38 7.5 26 10.5 15Q12 12.5 13.5 15C14.5 23 15.5 30 17 35Q20 38 23 35C24.5 30 25.5 23 26.5 15Q28 12.5 29.5 15C32.5 26 33.5 38 32.7 49Z',
    canaux: 'M13.5 48C12.5 38 12 27 12 17M26.5 48C27.5 38 28 27 28 17',
  },
}

/** Ce qui se pose en TACHE sur l'émail, à l'endroit de la face notée. */
const TACHES: ToothStatus[] = ['obturation', 'carie'] // la carie par-dessus
/** Ce qui recouvre toute la couronne. */
const PROTHESES: ToothStatus[] = ['bridge', 'couronne']
const FACES_CONNUES = new Set<string>(['O', 'M', 'D', 'V', 'P'])

export interface LectureDent {
  extraite: boolean
  /** Couronne prothétique ou bridge : la couronne entière prend la couleur. */
  prothese: string | null
  bridge: boolean
  /** Carie, obturation : des taches sur l'émail. */
  taches: ToothStatus[]
  fracture: boolean
  /** Traitement de racine : la couleur des canaux. */
  canaux: string | null
  implant: boolean
  /** À extraire : la couleur de toute la dent. */
  toute: string | null
  contour: string | null
  /** Les états que le dessin ne montre PAS : une couronne sous un bridge, un
   *  traitement de racine sur un implant. Le schéma les signale en pastilles. */
  nonMontres: ToothStatus[]
}

/** Ce que le dessin doit montrer pour ces états, et ce qu'il laisse de côté. */
export function lireDent(etats: ToothStatus[]): LectureDent {
  const lu: LectureDent = {
    extraite: false, prothese: null, bridge: false, taches: [], fracture: false,
    canaux: null, implant: false, toute: null, contour: null, nonMontres: [],
  }
  if (etats.includes('extraite')) return { ...lu, extraite: true }

  const montres = new Set<ToothStatus>()

  // Une dent couronnée ET pilier de bridge : le bridge l'emporte, la couronne
  // se lit dans la pastille.
  const prothese = PROTHESES.find((e) => etats.includes(e))
  if (prothese) { lu.prothese = DENTAL_COLOR[prothese]; montres.add(prothese) }
  lu.bridge = prothese === 'bridge'

  lu.taches = TACHES.filter((e) => etats.includes(e))
  lu.taches.forEach((e) => montres.add(e))
  lu.fracture = etats.includes('fracture')
  if (lu.fracture) montres.add('fracture')

  lu.implant = etats.includes('implant')
  if (lu.implant) montres.add('implant')
  else if (etats.includes('endodontie')) { lu.canaux = DENTAL_COLOR.endodontie; montres.add('endodontie') }

  // « À extraire » teinte toute la dent : c'est la décision qui l'emporte sur
  // tout ce qu'on y a fait avant — les soins restent visibles par-dessus.
  if (etats.includes('a_extraire')) { lu.toute = DENTAL_COLOR.a_extraire; montres.add('a_extraire') }

  if (etats.includes('mobilite')) { lu.contour = DENTAL_COLOR.mobilite; montres.add('mobilite') }

  lu.nonMontres = etats.filter((e) => !montres.has(e))
  return lu
}

const PLANIFIE = '#334155' // le contour d'une dent où il reste un geste à faire
const FANTOME = '#cbd5e1'
const BORD_EMAIL = '#8d99a8'
const BORD_RACINE = '#a07467'

export default function DessinDent({ numero, etats, planifie = false, faces }: {
  numero: number
  etats: ToothStatus[]
  /** Un geste reste à faire sur cette dent : le contour passe en pointillés. */
  planifie?: boolean
  /** Les faces notées par état : la tache se pose là où est la carie. */
  faces?: Partial<Record<ToothStatus, ToothFace[]>>
}) {
  // Des identifiants propres à CETTE dent pour ses dégradés : 52 dents sur la
  // page, et un dégradé partagé disparaît dès que la dent qui le porte est
  // masquée (denture de lait repliée, par exemple).
  const p = `d${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const forme = formeDeLaDent(numero)
  const trace = TRACES[forme]
  const racines = RACINES[racinesDe(numero, forme)]
  const lu = lireDent(etats)
  const haut = dentDuHaut(numero)
  const lait = Math.floor(numero / 10) >= 5
  const sx = largeurDe(numero, forme)
  const { x0, x1, y0, y1 } = trace.boite
  const w = x1 - x0
  const h = y1 - y0
  const c = trace.collet

  // Une dent du bas est la même, retournée. Une dent de lait est la même, plus
  // petite — réduite vers le bord libre, pour que toutes les couronnes restent
  // alignées sur la ligne où les deux arcades se rencontrent.
  const transformations = [
    haut ? '' : 'translate(0 80) scale(1 -1)',
    lait ? 'translate(20 80) scale(0.82) translate(-20 -80)' : '',
    sx !== 1 ? `translate(20 0) scale(${sx} 1) translate(-20 0)` : '',
  ].filter(Boolean).join(' ')

  // ── Les taches, face par face ─────────────────────────────────────────────
  const aDroite = mesialADroite(numero)
  const tache = (etat: ToothStatus, face: ToothFace | null) => {
    const couleur = DENTAL_COLOR[etat]
    const bord = etat === 'carie' ? '#7f1d1d' : '#1e3a8a'
    const k = `${etat}-${face ?? 'x'}`
    if (face === 'O') {
      return <rect key={k} x={x0 - 2} y={y1 - 0.3 * h} width={w + 4} height={0.3 * h + 3}
        fill={couleur} stroke={bord} strokeOpacity={0.5} strokeWidth={0.6} />
    }
    if (face === 'M' || face === 'D') {
      const droite = (face === 'M') === aDroite
      return <rect key={k} x={droite ? x1 - 0.32 * w : x0 - 2} y={y0 + 0.3 * h}
        width={0.32 * w + 2} height={0.7 * h + 3} rx={2}
        fill={couleur} stroke={bord} strokeOpacity={0.5} strokeWidth={0.6} />
    }
    // Vestibulaire (ou face non notée) : au centre, face au praticien.
    // Palatine : derrière la dent, vue en transparence.
    return <ellipse key={k} cx={20} cy={y0 + 0.56 * h} rx={0.2 * w} ry={0.17 * h}
      fill={couleur} fillOpacity={face === 'P' ? 0.45 : 1}
      stroke={bord} strokeOpacity={0.5} strokeWidth={0.6}
      strokeDasharray={face === 'P' ? '1.5 1' : undefined} />
  }
  const taches = lu.taches.flatMap((etat) => {
    const fs = (faces?.[etat] ?? []).filter((f) => FACES_CONNUES.has(f))
    return fs.length > 0 ? fs.map((f) => tache(etat, f)) : [tache(etat, null)]
  })

  const fracture = `M${x0 - 1} ${y0 + 0.38 * h}L${x0 + 0.3 * w} ${y0 + 0.52 * h}L${x0 + 0.48 * w} ${y0 + 0.43 * h}L${x0 + 0.68 * w} ${y0 + 0.64 * h}L${x1 + 1} ${y0 + 0.56 * h}`
  const vis = `M15 ${c + 1}L25 ${c + 1}L24.3 16Q22.5 9 20 9Q17.5 9 15.7 16Z`

  const fondCouronne = lu.toute ?? lu.prothese
  const fondRacine = lu.toute

  return (
    <svg viewBox="0 0 40 80" className="block w-full h-auto" aria-hidden="true">
      <defs>
        {/* La racine : dentine rosée, un cylindre éclairé de face. */}
        <linearGradient id={`${p}r`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#b88577" />
          <stop offset="0.28" stopColor="#ddb5a6" />
          <stop offset="0.47" stopColor="#efd5ca" />
          <stop offset="0.72" stopColor="#d3a596" />
          <stop offset="1" stopColor="#a6766a" />
        </linearGradient>
        {/* Plus sombre vers l'apex : la racine s'enfonce dans l'os. */}
        <linearGradient id={`${p}a`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5b3128" stopOpacity="0.3" />
          <stop offset="0.6" stopColor="#5b3128" stopOpacity="0" />
        </linearGradient>
        {/* L'émail : nacré au centre, gris bleuté sur les bords. */}
        <radialGradient id={`${p}c`} cx="0.42" cy="0.55" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f4f6f9" />
          <stop offset="0.82" stopColor="#dce2e9" />
          <stop offset="1" stopColor="#b9c3ce" />
        </radialGradient>
        {/* L'ivoire du collet, là où l'émail s'amincit. */}
        <linearGradient id={`${p}i`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#d9c39a" stopOpacity="0.5" />
          <stop offset="0.32" stopColor="#d9c39a" stopOpacity="0" />
        </linearGradient>
        {/* Le calque de volume, posé sur n'importe quelle couleur. */}
        <linearGradient id={`${p}o`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0f172a" stopOpacity="0.32" />
          <stop offset="0.24" stopColor="#0f172a" stopOpacity="0" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0.34" />
        </linearGradient>
        {/* Le reflet spéculaire de l'émail. */}
        <radialGradient id={`${p}h`}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Le titane de l'implant. */}
        <linearGradient id={`${p}t`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#4b5563" />
          <stop offset="0.4" stopColor="#e5e7eb" />
          <stop offset="0.65" stopColor="#9ca3af" />
          <stop offset="1" stopColor="#374151" />
        </linearGradient>
        <clipPath id={`${p}k`}><path d={trace.couronne} /></clipPath>
        <clipPath id={`${p}rk`}><path d={racines.avant} /></clipPath>
      </defs>

      <g transform={transformations || undefined} strokeLinejoin="round" strokeLinecap="round">
        {lu.extraite ? (
          <>
            {/* La dent n'est plus là : on garde sa place, en fantôme, pour que
                l'arcade ne se resserre pas et que le trou se voie. */}
            <path d={racines.avant} fill="#f1f5f9" fillOpacity={0.6} stroke={FANTOME} strokeWidth="0.9" strokeDasharray="2 1.6" />
            <path d={trace.couronne} fill="#f1f5f9" fillOpacity={0.6} stroke={FANTOME} strokeWidth="0.9" strokeDasharray="2 1.6" />
            <path d="M9 28L31 74M31 28L9 74" stroke={DENTAL_COLOR.extraite} strokeWidth="2.4" fill="none" />
          </>
        ) : (
          <>
            {/* ── Les racines ── */}
            {lu.implant ? (
              <>
                {/* L'implant : une vis de titane à la place de la racine,
                    teintée de la couleur de la légende. */}
                <path d={vis} fill={`url(#${p}t)`} />
                <path d={vis} fill={DENTAL_COLOR.implant} fillOpacity={0.45} stroke="#4c1d95" strokeOpacity={0.6} strokeWidth="0.7" />
                {Array.from({ length: Math.floor((c - 18) / 4.5) }, (_, i) => c - 3 - i * 4.5).map((y) => (
                  <g key={y}>
                    <path d={`M15.2 ${y}L24.8 ${y - 1.6}`} stroke="#1f2937" strokeOpacity={0.55} strokeWidth="1" />
                    <path d={`M15.4 ${y + 0.9}L24.6 ${y - 0.7}`} stroke="#ffffff" strokeOpacity={0.55} strokeWidth="0.5" />
                  </g>
                ))}
              </>
            ) : (
              <>
                {racines.arriere && (
                  <>
                    <path d={racines.arriere} fill={fondRacine ?? `url(#${p}r)`} />
                    <path d={racines.arriere} fill="#3b1f19" fillOpacity={0.16} stroke={BORD_RACINE} strokeWidth="0.6" />
                  </>
                )}
                <path d={racines.avant} fill={fondRacine ?? `url(#${p}r)`} />
                {fondRacine && <path d={racines.avant} fill={`url(#${p}o)`} />}
                <path d={racines.avant} fill={`url(#${p}a)`} />
                {/* L'ombre que la couronne porte sur la racine. */}
                <path d={trace.couronne} transform="translate(0 -1.6)" fill="#4a2a22" fillOpacity={0.22}
                  clipPath={`url(#${p}rk)`} />
                {lu.canaux && (
                  <>
                    <path d={racines.canaux} fill="none" stroke={lu.canaux} strokeWidth="2.4" />
                    <path d={racines.canaux} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth="0.6" />
                  </>
                )}
                <path d={racines.avant} fill="none" stroke={fondRacine ? '#7c2d12' : BORD_RACINE}
                  strokeOpacity={fondRacine ? 0.5 : 1} strokeWidth="0.7" />
              </>
            )}

            {/* ── La couronne ── */}
            {lu.bridge && (
              // Les ponts du bridge, vers les dents voisines.
              <g>
                <rect x={-3} y={y0 + 0.36 * h} width={x0 + 6} height={0.24 * h} rx={2} fill={DENTAL_COLOR.bridge} />
                <rect x={x1 - 3} y={y0 + 0.36 * h} width={46 - x1} height={0.24 * h} rx={2} fill={DENTAL_COLOR.bridge} />
              </g>
            )}
            <path d={trace.couronne} fill={fondCouronne ?? `url(#${p}c)`} />
            <g clipPath={`url(#${p}k)`}>
              <rect x="0" y={y0 - 6} width="40" height={h + 10} fill={fondCouronne ? `url(#${p}o)` : `url(#${p}i)`} />
              {trace.relief && <path d={trace.relief} fill="none" stroke="#64748b" strokeOpacity={0.22} strokeWidth="0.8" />}
              {taches}
              {lu.fracture && (
                <>
                  <path d={fracture} fill="none" stroke="#ffffff" strokeOpacity={0.8} strokeWidth="3" />
                  <path d={fracture} fill="none" stroke={DENTAL_COLOR.fracture} strokeWidth="1.7" />
                </>
              )}
              {/* Le reflet, par-dessus tout : c'est lui qui donne le relief. */}
              <ellipse cx={x0 + 0.33 * w} cy={y0 + 0.45 * h} rx={0.13 * w} ry={0.24 * h} fill={`url(#${p}h)`}
                opacity={fondCouronne ? 0.6 : 0.9} transform={`rotate(-8 ${x0 + 0.33 * w} ${y0 + 0.45 * h})`} />
            </g>
            <path d={trace.couronne} fill="none" stroke={fondCouronne ? '#0f172a' : BORD_EMAIL}
              strokeOpacity={fondCouronne ? 0.4 : 1} strokeWidth="0.7" />

            {/* « À faire » : le contour passe en pointillés SOMBRES, par-dessus
                tout — tracé dans la couleur du soin, il ne se voyait plus. */}
            {planifie && (
              <>
                {!lu.implant && <path d={racines.avant} fill="none" stroke={PLANIFIE} strokeWidth="1.5" strokeDasharray="3 2" />}
                <path d={trace.couronne} fill="none" stroke={PLANIFIE} strokeWidth="1.5" strokeDasharray="3 2" />
              </>
            )}

            {/* Mobilité : le contour coloré, et deux arcs de mouvement. */}
            {lu.contour && !planifie && (
              <path d={trace.couronne} fill="none" stroke={lu.contour} strokeWidth="1.8" />
            )}
            {lu.contour && (
              <path d={`M${x0 - 2} ${y0 + 0.3 * h}Q${x0 - 4} ${y0 + 0.5 * h} ${x0 - 2} ${y0 + 0.7 * h}M${x1 + 2} ${y0 + 0.3 * h}Q${x1 + 4} ${y0 + 0.5 * h} ${x1 + 2} ${y0 + 0.7 * h}`}
                fill="none" stroke={lu.contour} strokeWidth="1.3" />
            )}
          </>
        )}
      </g>
    </svg>
  )
}
