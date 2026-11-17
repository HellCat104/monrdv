'use client'

// Schéma dentaire cliquable, affiché dans la fiche patient des dentistes.
// Chaque dent (notation FDI) peut porter PLUSIEURS états à la fois : une couronne
// se carie, une dent obturée devient à extraire… La saisie est donc une série de
// cases à cocher, pas un choix unique.
//
// Sauvegarde automatique (débouncée) via app/api/dental/[id] : depuis la
// migration v55, le navigateur n'écrit plus `dental_charts` directement. C'est
// la route serveur qui compare l'ancien schéma au nouveau et journalise, dent
// par dent, ce qui a changé (table tooth_history). Un journal alimenté par le
// navigateur ne prouverait rien : il ne contiendrait que ce que le client a
// bien voulu déclarer.
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, ChevronLeft, ChevronRight, ClipboardPlus, Maximize2, PanelRightOpen, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import DentDevis from '@/components/dashboard/DentDevis'
import DessinDent, { dentDuHaut, lireDent } from '@/components/dashboard/DessinDent'
import DentDessus from '@/components/dentaire/DentDessus'
import type { ChangementSchema } from '@/lib/actes-patient'
import {
  DENTAL_STATES, DENTAL_COLOR, FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT,
  ETATS_AVEC_FACES, estDentDeLait,
  normalizeTeeth, toggleToothState, toggleFace, toothFaces, allToothFaces, facesLabel,
  statesWithFacesLabel,
  DENTAL_NATURES, natureDe, GROUPES_ETATS, DENTAL_FACE_LABEL,
  type DentalTeeth, type ToothStatus, type ToothFace, type ToothNature, type GroupeEtat,
} from '@/lib/dental'

/** Le jour, écrit depuis les composantes locales : passer par toISOString()
 *  recule d'un jour dès que l'heure locale est en avance sur UTC. */
function aujourdhui(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
import {
  describeToothChange, formatToothEventDate, toothEventTitle,
  type ToothEvent,
} from '@/lib/dental-history'

export default function DentalChart({ patientId, dentsAvecImage, appointmentId = null, onDentActive, panneauDent, onAjouterActe, apresActe }: {
  patientId: string
  doctorId: string
  /** Le rendez-vous en cours, quand le schéma est ouvert en consultation.
   *  Chaque changement est alors rattaché à cette séance dans l'historique
   *  (v100) : le dossier saura dire ce qui a été fait ce jour-là. */
  appointmentId?: string | null
  /** Prévient l'écran parent de la dent ouverte — l'espace patient s'en sert
   *  pour montrer, à côté du schéma, les clichés et le plan de cette dent. */
  onDentActive?: (dent: string | null) => void
  /** Ce que l'écran parent veut ajouter au panneau de la dent ouverte
   *  (clichés, lignes du plan de traitement…). */
  panneauDent?: (dent: string) => React.ReactNode
  /** Les dents qui portent au moins un cliché ciblé (v94). Le parent les
   *  calcule une fois à partir des images déjà chargées : deux requêtes
   *  finiraient par afficher deux vérités sur la même arcade.
   *  Les panoramiques en sont exclues — elles marqueraient les trente-deux
   *  dents, et un repère qui s'allume partout ne signale plus rien. */
  dentsAvecImage?: Set<string>
  /** LE GESTE DES ACTES. Fourni, il change ce que fait un clic : on
   *  SÉLECTIONNE les dents (plusieurs), puis « Ajouter un acte » remonte la
   *  sélection à l'écran parent, qui ouvre la fenêtre de l'acte. La fiche
   *  d'une dent reste à un double-clic, ou au bouton « Fiche de la dent ».
   *  Absent, un clic ouvre la fiche, comme avant. */
  onAjouterActe?: (dents: string[], faces: string[]) => void
  /** Ce qu'un acte enregistré change sur le schéma (lib/actes-patient,
   *  `changementsSchema`). Chaque nouveau `jeton` applique ses changements
   *  — enregistrés et journalisés comme un clic — puis vide la sélection. */
  apresActe?: { jeton: number; changements: ChangementSchema[] } | null
}) {
  const supabase = createClient()
  const [teeth, setTeeth] = useState<DentalTeeth>({})
  const [history, setHistory] = useState<ToothEvent[]>([])
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => { onDentActive?.(active) }, [active, onDentActive])
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // L'enregistrement a réussi mais sa trace n'a pas pu être écrite : le
  // praticien doit le savoir, c'est précisément ce sur quoi il comptera le jour
  // où un patient contestera.
  const [journalKo, setJournalKo] = useState(false)
  // null = pas encore choisi par le praticien : l'affichage se règle alors sur
  // le contenu du dossier (voir `denture` plus bas).
  const [dentureChoisie, setDentureChoisie] = useState<'definitive' | 'lait' | 'mixte' | null>(null)
  // Nature posée par défaut quand on coche un état. « Constaté » au fauteuil ;
  // le praticien qui prépare un plan de traitement bascule sur « À faire » et
  // n'a plus à la préciser dent après dent.
  const [natureParDefaut, setNatureParDefaut] = useState<ToothNature>('constate')
  // La vue agrandie : l'arcade en grand et la fiche de la dent côte à côte.
  const [agrandi, setAgrandi] = useState(false)
  // Les dents touchées en vue d'un acte, dans l'ordre du clic.
  const [selection, setSelection] = useState<string[]>([])
  // Les faces touchées sur la vue de dessus : elles valent pour l'acte, donc
  // pour toutes les dents sélectionnées (la fenêtre de l'acte les corrige).
  const [facesChoisies, setFacesChoisies] = useState<string[]>([])
  const modeActes = !!onAjouterActe
  const basculerSelection = (dent: string) =>
    setSelection((prev) => {
      const next = prev.includes(dent) ? prev.filter((d) => d !== dent) : [...prev, dent]
      if (next.length === 0) setFacesChoisies([])
      return next
    })
  /** Une face touchée sur la vue de dessus : la dent est sélectionnée (si elle
   *  ne l'était pas) et la face s'ajoute — ou se retire si elle y était. */
  const toucherFace = (dent: string, face: string) => {
    setSelection((prev) => (prev.includes(dent) ? prev : [...prev, dent]))
    setFacesChoisies((prev) => (prev.includes(face) ? prev.filter((f) => f !== face) : [...prev, face]))
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Le dernier schéma pas encore envoyé. Si le praticien quitte l'écran dans
  // les 600 ms qui suivent un clic, il part quand même : l'enregistrement
  // différé était ANNULÉ au démontage, et le dernier geste se perdait.
  const enAttente = useRef<DentalTeeth | null>(null)
  const seance = useRef<string | null>(appointmentId)
  seance.current = appointmentId

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Le schéma se lit toujours directement (policy SELECT de v20/v55) ;
      // l'historique passe par la route serveur, seule à voir tooth_history et
      // seule à contrôler le forfait de façon non contournable.
      const [chart, hist] = await Promise.all([
        supabase.from('dental_charts').select('teeth').eq('patient_id', patientId).maybeSingle(),
        fetch(`/api/dental/${patientId}`).then((r) => (r.ok ? r.json() : { history: [] })).catch(() => ({ history: [] })),
      ])
      // normalizeTeeth() absorbe l'ancien format « un seul état » ({"16":{"s":"carie"}})
      // encore présent en base : on lit les deux formats, on n'écrit que des tableaux.
      if (!cancelled) {
        setTeeth(normalizeTeeth(chart.data?.teeth))
        setHistory((hist?.history ?? []) as ToothEvent[])
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
      // Envoi immédiat de ce qui attendait, `keepalive` pour qu'il survive à
      // un changement de page.
      if (enAttente.current) {
        fetch(`/api/dental/${patientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teeth: enAttente.current, appointment_id: seance.current }),
          keepalive: true,
        }).catch(() => {})
        enAttente.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  function scheduleSave(next: DentalTeeth) {
    setSaveState('saving')
    enAttente.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      timer.current = null
      enAttente.current = null
      let res: Response
      try {
        res = await fetch(`/api/dental/${patientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teeth: next, appointment_id: seance.current }),
        })
      } catch { setSaveState('error'); return }
      if (!res.ok) { setSaveState('error'); return }
      const data = await res.json().catch(() => ({}))
      setJournalKo(data.journal === false)
      // Les lignes d'historique nées de CET enregistrement reviennent avec la
      // réponse : le panneau se met à jour sans second aller-retour.
      const events = (data.events ?? []) as ToothEvent[]
      if (events.length > 0) setHistory((prev) => [...events, ...prev])
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
    }, 600)
  }

  // Bascule un état de la dent. La règle métier (« extraite » exclusive) vit dans
  // lib/dental.ts pour rester identique à l'écran et à l'export.
  function toggleState(n: string, s: ToothStatus) {
    setTeeth((prev) => {
      const next = { ...prev }
      const avant = prev[n]?.s ?? []
      const states = toggleToothState(avant, s)
      // Plus aucun état : la dent sort du schéma (et sa note avec elle).
      if (states.length === 0) { delete next[n]; scheduleSave(next); return next }

      const ajoute = states.includes(s) && !avant.includes(s)
      const p = { ...(next[n]?.p ?? {}) }
      const d = { ...(next[n]?.d ?? {}) }
      if (ajoute) {
        // Un état qu'on vient de cocher est CONSTATÉ, et daté du jour : c'est
        // ce que fait le praticien au fauteuil. Les trois autres natures se
        // choisissent ensuite, en un clic, sur la ligne de l'état.
        p[s] = natureParDefaut
        d[s] = aujourdhui()
      } else {
        delete p[s]; delete d[s]
      }
      next[n] = { ...next[n], s: states, p, d }
      scheduleSave(next)
      return next
    })
  }

  /** Changer la nature d'un état déjà posé : constaté → à faire → réalisé.
   *  C'est le geste qui fait vivre le plan de traitement sur le schéma. */
  function changerNature(n: string, s: ToothStatus, nature: ToothNature) {
    setTeeth((prev) => {
      const next = { ...prev }
      if (!next[n]) return prev
      const p = { ...(next[n].p ?? {}), [s]: nature }
      const d = { ...(next[n].d ?? {}) }
      // La date suit la nature : « réalisé le » est l'information qu'on
      // cherchera dans six mois, pas la date du diagnostic.
      d[s] = aujourdhui()
      next[n] = { ...next[n], p, d }
      scheduleSave(next)
      return next
    })
  }
  // Coche / décoche une face pour un état. La face appartient à l'état : une
  // carie occlusale et un composite mésial cohabitent sur la même dent.
  function toggleToothFace(n: string, s: ToothStatus, f: ToothFace) {
    setTeeth((prev) => {
      const cur = prev[n]
      if (!cur || !cur.s.includes(s)) return prev
      const faces = toggleFace(toothFaces(cur, s), f)
      const toutes = { ...(cur.f ?? {}) }
      if (faces.length > 0) toutes[s] = faces
      else delete toutes[s]
      const next = {
        ...prev,
        [n]: { ...cur, ...(Object.keys(toutes).length > 0 ? { f: toutes } : { f: undefined }) },
      }
      scheduleSave(next)
      return next
    })
  }

  function clearTooth(n: string) {
    setTeeth((prev) => {
      const next = { ...prev }
      delete next[n]
      scheduleSave(next)
      return next
    })
  }
  function setNote(n: string, note: string) {
    setTeeth((prev) => {
      const cur = prev[n]
      if (!cur) return prev // pas de note sans état
      const next = { ...prev, [n]: { ...cur, n: note || undefined } }
      scheduleSave(next)
      return next
    })
  }

  /** Pose sur le schéma ce qu'un acte vient de changer : l'état, sa nature
   *  (à faire / réalisé), sa date et ses faces. Même enregistrement qu'un
   *  clic — donc même journal, dent par dent. */
  function appliquerChangements(changements: ChangementSchema[]) {
    if (changements.length === 0) return
    setTeeth((prev) => {
      const next = { ...prev }
      for (const c of changements) {
        const cur = next[c.dent]
        let etats = cur?.s ?? []
        // Une extraction faite remplace l'extraction prévue.
        if (c.etat === 'extraite') etats = etats.filter((e) => e !== 'a_extraire')
        if (!etats.includes(c.etat)) etats = toggleToothState(etats, c.etat)
        const garde = <T,>(o: Partial<Record<ToothStatus, T>> | undefined) =>
          Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => etats.includes(k as ToothStatus))) as Partial<Record<ToothStatus, T>>
        const p = { ...garde(cur?.p), [c.etat]: c.nature }
        const d = { ...garde(cur?.d), [c.etat]: aujourdhui() }
        const f = garde(cur?.f)
        if (c.faces.length > 0) f[c.etat] = Array.from(new Set([...(f[c.etat] ?? []), ...c.faces]))
        next[c.dent] = {
          s: etats,
          ...(cur?.n ? { n: cur.n } : {}),
          ...(Object.keys(f).length > 0 ? { f } : {}),
          p, d,
        }
      }
      scheduleSave(next)
      return next
    })
  }

  // Un acte vient d'être enregistré : le schéma suit, la sélection se vide.
  const dernierJeton = useRef<number | null>(null)
  useEffect(() => {
    if (!apresActe || !loaded || dernierJeton.current === apresActe.jeton) return
    dernierJeton.current = apresActe.jeton
    appliquerChangements(apresActe.changements)
    setSelection([])
    setFacesChoisies([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apresActe, loaded])

  const Tooth = ({ n, grand = false }: { n: number; grand?: boolean }) => {
    const key = String(n)
    const info = teeth[key]
    const states = info?.s ?? []
    const isActive = active === key
    const choisie = selection.includes(key)
    const haut = dentDuHaut(n)
    // Toutes les faces notées sur cette dent, sans doublon : « O » d'une carie
    // et « O » d'une obturation ne s'affichent qu'une fois.
    const marqueFaces = Array.from(
      new Set(states.flatMap((st) => toothFaces(info, st))),
    ).join('')

    // ── CE QUI RESTE À FAIRE, VU DE LOIN ────────────────────────────────────
    //
    // La couleur dit QUEL acte ; elle ne dit pas où il en est. Sur une arcade
    // de 32 dents, la question du praticien n'est pas « quelle est la couleur
    // de la 46 » mais « qu'est-ce qu'il me reste à faire sur ce patient ».
    //
    // On ne regarde donc PAS seulement l'état dominant : une dent dont la
    // carie est constatée et l'obturation prévue doit se signaler comme ayant
    // du travail en attente, alors que c'est la carie qui lui donne sa couleur.
    const aPlanifie = states.some((st) => natureDe(info, st) === 'planifie')
    const aRealise = states.some((st) => natureDe(info, st) === 'realise')
    // Ce que le dessin ne peut pas montrer : une dent cariée ET obturée n'a
    // qu'une couronne à colorer. Ces états-là restent visibles, en pastilles.
    const enPlus = lireDent(states).nonMontres

    // Le numéro et ses repères, du côté où les deux arcades se rencontrent :
    // sous une dent du haut, au-dessus d'une dent du bas. C'est là qu'on lit
    // les numéros sur un schéma papier, et c'est ce qui laisse les racines
    // pointer vers l'extérieur comme dans la bouche.
    const numero = (
      <span className="flex flex-col items-center leading-none">
        <span className="flex items-center gap-[2px]">
          {/* Le repère d'imagerie : cette dent a un cliché au dossier. */}
          {dentsAvecImage?.has(key) && <span className="w-[4px] h-[4px] rounded-[1px] bg-sky-500" />}
          <span className={`${grand ? 'text-[13px]' : 'text-[11px]'} font-semibold ${states.length > 0 ? 'text-gray-800' : 'text-gray-500'} ${states.includes('extraite') ? 'line-through text-gray-400' : ''}`}>{n}</span>
          {/* La coche : un soin a été fait sur cette dent. */}
          {aRealise && <span className="text-[9px] font-bold text-emerald-600">✓</span>}
        </span>
        {/* Les faces, en toutes petites initiales : « OM » se lit d'un coup
            d'œil sur l'arcade entière, là où il faudrait ouvrir chaque dent. */}
        {marqueFaces && <span className="text-[8px] font-bold text-gray-400 mt-[1px]">{marqueFaces}</span>}
        {enPlus.length > 0 && (
          <span className="flex gap-[1px] mt-[2px]">
            {enPlus.map((e) => (
              <span key={e} className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: DENTAL_COLOR[e] }} />
            ))}
          </span>
        )}
      </span>
    )

    return (
      <button
        type="button"
        onClick={(e) => {
          if (!modeActes) { setActive(key); return }
          // Touché sur une FACE de la vue de dessus : la face compte aussi.
          const face = (e.target as Element).closest?.('[data-face]')?.getAttribute('data-face')
          if (face) toucherFace(key, face)
          else basculerSelection(key)
        }}
        onDoubleClick={modeActes ? () => setActive(key) : undefined}
        aria-pressed={modeActes ? choisie : undefined}
        title={`${states.length > 0 ? `Dent ${n} — ${statesWithFacesLabel(info)}${info?.n ? ` · ${info.n}` : ''}` : `Dent ${n}`}${
          dentsAvecImage?.has(key) ? ' · image au dossier' : ''}`}
        // ÉLASTIQUE : la dent occupe la place disponible, sans jamais dépasser
        // 38 px (sinon l'arcade s'étire bêtement sur un grand écran) ni
        // descendre sous 20 px (en dessous, le défilement reprend la main).
        // La hauteur suit la largeur : c'est le dessin qui la fixe.
        // Une dent de lait est plafonnée plus bas : elles ne sont que dix par
        // rangée, et sans ce plafond elles s'étalaient plus LARGES que les
        // seize définitives au-dessus — des dents de lait plus grosses que
        // des molaires d'adulte, vu en production sur un dossier d'enfant.
        className={`flex-1 basis-0 min-w-[18px] ${grand
          ? (estDentDeLait(key) ? 'max-w-[40px]' : 'max-w-[64px]')
          : (estDentDeLait(key) ? 'max-w-[26px]' : 'max-w-[44px]')} flex flex-col items-center gap-[3px] rounded-lg px-[1px] py-1 transition hover:bg-gray-50 ${
          choisie ? 'bg-sky-50 ring-2 ring-sky-500' : isActive ? 'bg-primary-50 ring-2 ring-primary-500' : ''}`}
      >
        {/* Le profil (couronne et racines), puis la face de mastication vue
            de dessus, puis le numéro — dans l'ordre inverse pour le bas, pour
            que les deux arcades se regardent comme dans la bouche. */}
        {!haut && numero}
        {!haut && <DentDessus numero={n} etats={states} planifie={aPlanifie} faces={allToothFaces(info)}
          selectionnable={modeActes} facesChoisies={choisie ? facesChoisies : undefined} />}
        <DessinDent numero={n} etats={states} planifie={aPlanifie} faces={allToothFaces(info)} />
        {haut && <DentDessus numero={n} etats={states} planifie={aPlanifie} faces={allToothFaces(info)}
          selectionnable={modeActes} facesChoisies={choisie ? facesChoisies : undefined} />}
        {haut && numero}
      </button>
    )
  }

  // Une arcade = hémi-arcade droite du patient (à gauche de l'écran : vue du
  // praticien), écart médian franc, puis hémi-arcade gauche.
  const Row = ({ ids, lait = false, grand = false }: { ids: number[]; lait?: boolean; grand?: boolean }) => {
    // Une hémi-arcade : 8 dents définitives, 5 de lait.
    const moitie = ids.length / 2
    return (
      // Les dents d'une même rangée n'ont pas toutes la même hauteur une fois
      // leurs repères ajoutés : on les cale sur le bord où les deux arcades se
      // rencontrent — en bas pour le haut, en haut pour le bas.
      <div className={`flex justify-center ${dentDuHaut(ids[0]) ? 'items-end' : 'items-start'}`}>
        <div className={`flex-1 flex gap-[2px] justify-end ${dentDuHaut(ids[0]) ? 'items-end' : 'items-start'}`}>{ids.slice(0, moitie).map((n) => <Tooth key={n} n={n} grand={grand} />)}</div>
        <div className="w-5 shrink-0 flex justify-center self-stretch"><span className="border-l border-dashed border-gray-300 self-stretch" /></div>
        <div className={`flex-1 flex gap-[2px] justify-start ${dentDuHaut(ids[0]) ? 'items-end' : 'items-start'}`}>{ids.slice(moitie).map((n) => <Tooth key={n} n={n} grand={grand} />)}</div>
        {lait && <span className="self-center ml-2 text-[9px] text-gray-300 shrink-0">lait</span>}
      </div>
    )
  }

  if (!loaded) {
    return <div className="border-t border-gray-100 pt-4"><div className="h-24 bg-gray-50 rounded animate-pulse" /></div>
  }

  // Denture affichée. On ouvre sur les définitives, sauf si ce dossier porte
  // déjà des dents de lait : un enfant suivi depuis deux ans ne doit pas
  // obliger le praticien à cliquer avant de voir ce qu'il a noté.
  const aDesDentsDeLait = Object.keys(teeth).some((k) => estDentDeLait(k))
  const denture = dentureChoisie ?? (aDesDentsDeLait ? 'mixte' : 'definitive')

  const activeInfo = active ? teeth[active] : undefined
  const activeStates = activeInfo?.s ?? []
  // L'historique de la SEULE dent ouverte, du plus récent au plus ancien (la
  // route renvoie déjà cet ordre). Une dent jamais modifiée n'a pas de bloc.
  const activeHistory = active ? history.filter((e) => e.tooth === active) : []

  // L'ordre de lecture de l'arcade affichée, pour passer d'une dent à la
  // suivante sans refermer la fiche.
  const ordre: number[] = [
    ...(denture !== 'lait' ? FDI_UPPER : []), ...(denture !== 'definitive' ? FDI_UPPER_LAIT : []),
    ...(denture !== 'definitive' ? FDI_LOWER_LAIT : []), ...(denture !== 'lait' ? FDI_LOWER : []),
  ]
  const rang = active ? ordre.indexOf(Number(active)) : -1
  const voisine = (pas: number) => (rang >= 0 ? ordre[(rang + pas + ordre.length) % ordre.length] : null)

  const etatsDuGroupe = (g: GroupeEtat) => DENTAL_STATES.filter((s) => s.groupe === g)

  /** Les cinq faces, dessinées comme on les voit d'en haut : vestibulaire en
   *  haut, palatine / linguale en bas, occlusale au centre, mésiale du côté du
   *  milieu de la bouche. Un clic coche la face pour CET état. */
  const croixFaces = (n: string, st: ToothStatus) => {
    const faces = toothFaces(activeInfo, st)
    const q = Math.floor(Number(n) / 10)
    const mesialADroite = q === 1 || q === 4 || q === 5 || q === 8
    const face = (f: ToothFace, place: string) => {
      const on = faces.includes(f)
      return (
        <button key={f} type="button" aria-pressed={on} title={DENTAL_FACE_LABEL[f]}
          onClick={() => toggleToothFace(n, st, f)}
          className={`${place} h-6 rounded text-[10px] font-bold border transition ${on
            ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'}`}
          style={on ? { backgroundColor: DENTAL_COLOR[st] } : undefined}>
          {f}
        </button>
      )
    }
    return (
      <div className="grid grid-cols-3 gap-[3px] w-[84px] shrink-0">
        <span />{face('V', '')}<span />
        {face(mesialADroite ? 'D' : 'M', '')}{face('O', '')}{face(mesialADroite ? 'M' : 'D', '')}
        <span />{face('P', '')}<span />
      </div>
    )
  }

  /** La fiche d'UNE dent : ce qu'elle porte, où, et où en est chaque acte.
   *  Ouverte dans une fenêtre : sous l'arcade, elle poussait le reste de la
   *  consultation hors de l'écran, et un dentiste ne voyait plus à quelle
   *  dent il était en train de toucher. */
  const ficheDent = (n: string) => (
    <div className="space-y-4">
      {/* En-tête : la dent dessinée en grand, son nom en clair, et de quoi
          passer à la voisine sans refermer. */}
      <div className="flex items-start gap-4">
        <div className="w-20 shrink-0 rounded-xl bg-gray-50 border border-gray-100 p-2">
          <DessinDent numero={Number(n)} etats={activeStates}
            planifie={activeStates.some((st) => natureDe(activeInfo, st) === 'planifie')}
            faces={allToothFaces(activeInfo)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-gray-900 leading-tight">Dent {n}</p>
          <p className="text-sm text-gray-500">{nomDent(Number(n))}</p>
          {activeStates.length === 0
            ? <p className="text-xs text-gray-400 mt-1.5">Dent saine — rien n’est noté. Choisissez ci-dessous ce que vous constatez ou ce que vous avez fait.</p>
            : <p className="text-xs text-gray-600 mt-1.5">{statesWithFacesLabel(activeInfo)}</p>}
          <div className="flex items-center gap-1.5 mt-2">
            <button type="button" onClick={() => { const v = voisine(-1); if (v) setActive(String(v)) }}
              className="inline-flex items-center gap-0.5 text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1 hover:border-gray-300">
              <ChevronLeft className="h-3.5 w-3.5" /> {voisine(-1)}
            </button>
            <button type="button" onClick={() => { const v = voisine(1); if (v) setActive(String(v)) }}
              className="inline-flex items-center gap-0.5 text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1 hover:border-gray-300">
              {voisine(1)} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 1. CE QU'ON NOTE. Trois familles, dans l'ordre où l'on examine : ce
          qu'on constate, ce qui a été soigné, ce qui manque ou remplace. */}
      <div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[11px] font-semibold text-gray-500 mr-1">Ce que je coche est</span>
          {DENTAL_NATURES.map((nat) => (
            <button key={nat.key} type="button" onClick={() => setNatureParDefaut(nat.key)} title={nat.aide}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition ${natureParDefaut === nat.key
                ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {nat.label.toLowerCase()}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {GROUPES_ETATS.map((g) => (
            <div key={g.cle}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1">{g.titre}</p>
              <div className="flex flex-wrap gap-1.5">
                {etatsDuGroupe(g.cle).map((s) => {
                  const on = activeStates.includes(s.key)
                  return (
                    <button key={s.key} type="button" aria-pressed={on} title={s.aide}
                      onClick={() => toggleState(n, s.key)}
                      className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg border transition ${on
                        ? 'font-semibold text-gray-900 bg-white shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                      style={on ? { borderColor: s.color } : undefined}>
                      <span className="w-3.5 h-3.5 rounded-[4px] inline-flex items-center justify-center shrink-0 border"
                        style={{ backgroundColor: on ? s.color : '#fff', borderColor: s.color }}>
                        {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />}
                      </span>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. CE QUI EST POSÉ SUR LA DENT — une carte par état : où en est
          l'acte, depuis quand, et sur quelles faces. C'est ici qu'un soin
          passe de « à faire » à « réalisé ». */}
      {activeStates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-500">Sur cette dent</p>
          {activeStates.map((st) => {
            const nat = natureDe(activeInfo, st)
            const quand = activeInfo?.d?.[st]
            const def = DENTAL_STATES.find((x) => x.key === st)
            return (
              <div key={st} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2"
                style={{ borderLeft: `4px solid ${DENTAL_COLOR[st]}` }}>
                <div className="min-w-[130px] flex-1">
                  <p className="text-sm font-medium text-gray-800">{def?.label}</p>
                  {quand && <p className="text-[10.5px] text-gray-400">noté le {quand.split('-').reverse().join('/')}</p>}
                </div>
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                  {DENTAL_NATURES.map((x) => (
                    <button key={x.key} type="button" onClick={() => changerNature(n, st, x.key)} title={x.aide}
                      className={`text-[11px] px-2 py-1 rounded-md transition ${nat === x.key
                        ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                      {x.label}
                    </button>
                  ))}
                </div>
                {ETATS_AVEC_FACES.has(st) && (
                  <div className="flex items-center gap-2">
                    {croixFaces(n, st)}
                    <span className="text-[10px] text-gray-400 w-16 leading-tight">
                      {toothFaces(activeInfo, st).length === 0 ? 'dent entière' : `face${toothFaces(activeInfo, st).length > 1 ? 's' : ''} ${facesLabel(toothFaces(activeInfo, st))}`}
                    </span>
                  </div>
                )}
                <button type="button" onClick={() => toggleState(n, st)} title="Retirer cet état"
                  className="text-gray-300 hover:text-red-500"><X className="h-4 w-4" /></button>
              </div>
            )
          })}
          <p className="text-[10px] text-gray-400">
            Faces : V vestibulaire (côté joue / lèvre) · P palatine ou linguale · O occlusale · M mésiale (vers le milieu) · D distale
          </p>
        </div>
      )}

      {/* Le pont vers le devis : un soin « à faire » devient une ligne de
          devis sans changer d'écran. */}
      <DentDevis
        patientId={patientId}
        dent={n}
        etatsPlanifies={activeStates
          .filter((st) => natureDe(activeInfo, st) === 'planifie')
          .map((st) => ({ cle: st, label: DENTAL_STATES.find((x) => x.key === st)?.label ?? st }))}
      />

      {activeInfo && (
        <div className="flex items-center gap-2">
          <input
            value={activeInfo.n ?? ''}
            onChange={(e) => setNote(n, e.target.value)}
            placeholder="Note sur cette dent (facultatif) — ex : à surveiller"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
          <button type="button" onClick={() => clearTooth(n)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200">
            Tout effacer
          </button>
        </div>
      )}

      {/* Histoire de la dent — la seule pièce que le praticien pourra opposer
          à un patient qui affirme « cette dent était saine ». */}
      {activeHistory.length > 0 && (
        <details className="rounded-lg border border-gray-100 px-3 py-2" open={activeHistory.length <= 4}>
          <summary className="text-[11px] font-semibold text-gray-500 cursor-pointer">
            Historique de la dent {n} ({activeHistory.length})
          </summary>
          <ul className="space-y-1 mt-1.5">
            {activeHistory.map((e, i) => {
              const { kind, texte } = describeToothChange(
                e.states_before, e.states_after, e.faces_before, e.faces_after,
                e.natures_before, e.natures_after,
              )
              const premiere = kind === 'creation' && i === activeHistory.length - 1
              return (
                <li key={e.id} className="text-[12px] text-gray-700 flex gap-1.5" title={toothEventTitle(e)}>
                  <span className="text-gray-400 shrink-0 tabular-nums">{formatToothEventDate(e.created_at)}</span>
                  <span className="text-gray-300">—</span>
                  <span className="min-w-0">
                    {texte}
                    {premiere && <span className="text-gray-400"> · première mention</span>}
                    {e.actor_role !== 'medecin' && <span className="text-gray-400"> · saisi par le secrétariat</span>}
                    {appointmentId && e.appointment_id === appointmentId && (
                      <span className="text-primary-600"> · aujourd&apos;hui</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {/* Ce que l'écran autour du schéma sait de cette dent : ses clichés,
          ses lignes du plan de traitement. */}
      {panneauDent && panneauDent(n)}
    </div>
  )

  /** Les arcades — à la taille de l'encart, ou en grand. */
  const arcades = (grand: boolean) => (
    <div className="overflow-x-auto pb-1">
      <div className={`flex flex-col ${grand ? 'gap-2.5 min-w-[640px]' : 'gap-1.5 min-w-[360px]'}`}>
        {/* Vue du praticien : le côté droit du patient est à GAUCHE. */}
        <div className={`flex ${grand ? 'text-xs' : 'text-[10px]'} text-gray-400`}>
          <div className="flex-1 text-center">Droite du patient</div>
          <div className="w-6 shrink-0" />
          <div className="flex-1 text-center">Gauche du patient</div>
        </div>
        {denture !== 'lait' && <Row ids={FDI_UPPER} grand={grand} />}
        {denture !== 'definitive' && <Row ids={FDI_UPPER_LAIT} lait grand={grand} />}
        <div className="flex items-center gap-2 text-[9px] text-gray-300 tracking-widest">
          <span className="flex-1 border-t border-gray-100" />MAXILLAIRE ↑ · ↓ MANDIBULE<span className="flex-1 border-t border-gray-100" />
        </div>
        {denture !== 'definitive' && <Row ids={FDI_LOWER_LAIT} lait grand={grand} />}
        {denture !== 'lait' && <Row ids={FDI_LOWER} grand={grand} />}
      </div>
    </div>
  )

  /** La légende, rangée comme la saisie : trois familles, puis ce que disent
   *  les contours (où en est l'acte). */
  const legende = (
    <div className="mt-3 space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5">
        {GROUPES_ETATS.map((g) => (
          <div key={g.cle}>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-0.5">{g.titre}</p>
            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
              {etatsDuGroupe(g.cle).map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-gray-600" title={s.aide}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: s.color }} /> {s.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5 border-t border-gray-100 text-[11px] text-gray-500">
        <span className="text-gray-400">Où en est l’acte :</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border-2 border-gray-400 bg-gray-300 inline-block" /> constaté
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border-2 border-dashed border-gray-700 inline-block" /> à faire (contour en tirets)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-emerald-600 font-bold">✓</span> réalisé (coche à côté du numéro)
        </span>
      </div>
    </div>
  )

  // Les dents affichées de chaque arcade : ce que « Tout le haut » et « Tout
  // le bas » sélectionnent (pas une dent de lait si on ne les montre pas).
  const dentsDuHaut = [...(denture !== 'lait' ? FDI_UPPER : []), ...(denture !== 'definitive' ? FDI_UPPER_LAIT : [])].map(String)
  const dentsDuBas = [...(denture !== 'definitive' ? FDI_LOWER_LAIT : []), ...(denture !== 'lait' ? FDI_LOWER : [])].map(String)
  const toutesChoisies = (ids: string[]) => ids.length > 0 && ids.every((d) => selection.includes(d))
  const choisirArcade = (ids: string[]) => setSelection((prev) => (
    toutesChoisies(ids) ? prev.filter((d) => !ids.includes(d)) : Array.from(new Set([...prev, ...ids]))
  ))

  /** LA BARRE DES ACTES : ce qui est sélectionné, et ce qu'on en fait. */
  const barreActes = modeActes && (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50/60 px-2.5 py-2 mb-3">
      <span className="text-[12px] text-sky-900 mr-1 min-w-0">
        {selection.length === 0
          ? 'Touchez les dents concernées, puis ajoutez l’acte.'
          : <>Dent{selection.length > 1 ? 's' : ''} <strong>{[...selection].sort((a, b) => ordre.indexOf(Number(a)) - ordre.indexOf(Number(b))).join(', ')}</strong>
            {facesChoisies.length > 0 && <> · face{facesChoisies.length > 1 ? 's' : ''} <strong>{facesChoisies.join(' ')}</strong></>}</>}
      </span>
      <button type="button" onClick={() => {
        // La fenêtre de l'acte s'ouvre par-dessus le schéma : la vue agrandie
        // se referme d'abord, sinon deux fenêtres se disputeraient le clavier.
        setAgrandi(false); setActive(null)
        onAjouterActe?.([...selection], [...facesChoisies])
      }}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-2.5 py-1.5">
        <ClipboardPlus className="h-3.5 w-3.5" /> Ajouter un acte{selection.length > 0 ? ` (${selection.length})` : ''}
      </button>
      {selection.length === 1 && (
        <button type="button" onClick={() => setActive(selection[0])}
          className="inline-flex items-center gap-1 text-[12px] text-gray-700 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5">
          <PanelRightOpen className="h-3.5 w-3.5" /> Fiche de la dent {selection[0]}
        </button>
      )}
      <span className="flex-1" />
      <button type="button" onClick={() => choisirArcade(dentsDuHaut)} aria-pressed={toutesChoisies(dentsDuHaut)}
        className={`text-[11px] rounded-lg px-2 py-1 border ${toutesChoisies(dentsDuHaut) ? 'bg-sky-500 text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
        Tout le haut
      </button>
      <button type="button" onClick={() => choisirArcade(dentsDuBas)} aria-pressed={toutesChoisies(dentsDuBas)}
        className={`text-[11px] rounded-lg px-2 py-1 border ${toutesChoisies(dentsDuBas) ? 'bg-sky-500 text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
        Tout le bas
      </button>
      {selection.length > 0 && (
        <button type="button" onClick={() => { setSelection([]); setFacesChoisies([]) }}
          className="text-[11px] text-gray-500 hover:text-gray-800 px-1.5 py-1">
          Désélectionner
        </button>
      )}
    </div>
  )

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <span>🦷</span> Schéma dentaire
          {saveState === 'saving' && <span className="text-[11px] text-gray-400 font-normal">Enregistrement…</span>}
          {saveState === 'saved' && <span className="text-[11px] text-green-600 font-normal inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> Enregistré</span>}
          {saveState === 'error' && <span className="text-[11px] text-red-500 font-normal">Échec de l&apos;enregistrement</span>}
        </h4>
        <button type="button" onClick={() => setAgrandi(true)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg px-2 py-1">
          <Maximize2 className="h-3.5 w-3.5" /> Agrandir
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        {modeActes
          ? 'Touchez une ou plusieurs dents pour leur ajouter un acte — ou directement une face sur la vue de dessus. La fiche d’une dent (ce qu’elle porte) s’ouvre d’un double-clic, ou par « Fiche de la dent » quand elle est seule sélectionnée.'
          : 'Touchez une dent pour ouvrir sa fiche : ce qu’elle porte, sur quelles faces, et où en est chaque soin.'}
      </p>
      {journalKo && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 mb-3">
          Le schéma est enregistré, mais l&apos;historique de la dent n&apos;a pas pu être écrit. Signalez-le : c&apos;est cette trace datée qui fait foi en cas de contestation.
        </p>
      )}

      {/* Denture temporaire : un enfant de six ans a vingt dents de lait et
          déjà ses premières molaires définitives — d'où le choix « les deux ». */}
      <div className="flex gap-1 mb-3">
        {([['definitive', 'Définitives'], ['lait', 'Dents de lait'], ['mixte', 'Les deux']] as const).map(([cle, lbl]) => (
          <button key={cle} type="button" onClick={() => setDentureChoisie(cle)}
            className={`text-[12px] px-2.5 py-1 rounded-lg border transition ${denture === cle ? 'bg-primary-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {barreActes}
      {arcades(false)}
      {legende}

      {/* LA VUE AGRANDIE : l'arcade en grand à gauche, la fiche de la dent
          touchée à droite — tout le travail d'un examen dans une fenêtre. */}
      <Dialog open={agrandi} onOpenChange={(o) => {
        setAgrandi(o)
        // En refermant la vue agrandie, la fiche ne doit pas se rouvrir en
        // petite fenêtre : on revient à l'encart, aucune dent ouverte.
        if (!o) setActive(null)
      }}>
        <DialogContent className="max-w-[1200px] w-[96vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Schéma dentaire</DialogTitle></DialogHeader>
          <div className={`grid gap-5 ${active ? 'lg:grid-cols-[1fr_440px]' : ''}`}>
            <div>
              {barreActes}
              {arcades(true)}
              {legende}
            </div>
            {active && (
              <div className="border-t lg:border-t-0 lg:border-l border-gray-100 pt-4 lg:pt-0 lg:pl-5">
                {ficheDent(active)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* LA FICHE DE LA DENT, en petite fenêtre au-dessus de l'encart. */}
      <Dialog open={!!active && !agrandi} onOpenChange={(o) => { if (!o) setActive(null) }}>
        <DialogContent className="max-w-[620px] w-[94vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="sr-only">Fiche de la dent {active}</DialogTitle></DialogHeader>
          {active && ficheDent(active)}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Le nom d'une dent en clair : « 1re molaire, en bas à gauche ». Le numéro
 *  FDI se lit vite quand on en a l'habitude ; le nom évite l'erreur de
 *  quadrant à qui ne l'a pas. */
export function nomDent(fdi: number): string {
  const q = Math.floor(fdi / 10)
  const p = fdi % 10
  const lait = q >= 5
  const noms = lait
    ? ['', 'incisive centrale de lait', 'incisive latérale de lait', 'canine de lait', '1re molaire de lait', '2e molaire de lait']
    : ['', 'incisive centrale', 'incisive latérale', 'canine', '1re prémolaire', '2e prémolaire', '1re molaire', '2e molaire', 'dent de sagesse']
  const cote = { 1: 'en haut à droite', 2: 'en haut à gauche', 3: 'en bas à gauche', 4: 'en bas à droite' }[((q - 1) % 4) + 1] ?? ''
  const nom = noms[p] ?? ''
  return nom ? `${nom.charAt(0).toUpperCase()}${nom.slice(1)}, ${cote} (côté patient)` : ''
}
