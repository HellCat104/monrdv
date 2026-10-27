'use client'

// Agenda interactif de la secrétaire : liste du jour, création de RDV,
// pointage des présences, encaissement et annulation — selon ses permissions.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getNowInMaroc, formatTime, formatAge, minutesDepuis, APPEL_VALIDE_MIN } from '@/lib/utils'
import { etatPatient, resumeEchange, retardMinutes } from '@/lib/file-attente'
import { useRafraichissement } from '@/lib/rafraichissement'
import { posteUtile, posteActifs, type Poste } from '@/lib/postes'
import BoutonsFile from '@/components/cabinet/BoutonsFile'
import { format, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, eachDayOfInterval, getDay, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Plus, X, ChevronLeft, ChevronRight, CalendarClock, Ban, BellRing } from 'lucide-react'
import { PAYMENT_METHOD_LABELS, type StaffPermissions, type WorkingHours } from '@/types'
import { WeekGrid } from '@/components/dashboard/WeekGrid'
import { MonthGrid } from '@/components/dashboard/MonthGrid'

// Horaires de repli : la grille a besoin d'une amplitude pour se dessiner, et
// une base qui n'aurait pas encore de `working_hours` ne doit pas faire une
// page blanche. Elle s'élargit de toute façon sur les rendez-vous réels.
const HORAIRES_PAR_DEFAUT = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((j) => [j, { enabled: j !== 'sunday', start: '08:00', end: '19:00' }]),
) as unknown as WorkingHours
import DaySheet from '@/components/shared/DaySheet'
import { PatientPicker, type PatientChoice } from '@/components/shared/PatientPicker'
import { WalkInDialog, type PatientLite } from '@/components/dashboard/WalkInDialog'
import { FileText, UserPlus } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>
type Block = { id: string; date: string; start_time: string | null; end_time: string | null; reason: string | null }


interface CType { id: string; name: string; duration_minutes: number | null; default_price: number | null }
const NO_TYPE = '__none__'
// « Sans poste précisé » est une valeur, pas une absence de choix (v89).
const NO_POSTE = '__aucun__'

export default function AgendaClient({ permissions, doctorName = 'Cabinet médical' }: { permissions: StaffPermissions; doctorName?: string }) {
  const [date, setDate] = useState(() => format(getNowInMaroc(), 'yyyy-MM-dd'))
  const aujourdhui = format(getNowInMaroc(), 'yyyy-MM-dd')
  // Fil de messages ouvert sur un rendez-vous (v77)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [patientCache, setPatientCache] = useState<PatientLite[] | null>(null)
  // Deux façons de regarder la même journée, et la secrétaire ne les utilise
  // pas au même moment. La LISTE est son poste de travail : une ligne par
  // patient, avec les gestes au bout. Le CALENDRIER répond à la question du
  // téléphone — « vous avez quoi jeudi après-midi ? » — à laquelle une liste
  // ne répond pas : ce sont les TROUS qu'on y cherche, et une liste ne montre
  // que ce qui est pris.
  const [mode, setMode] = useState<'liste' | 'calendrier'>('liste')
  // Les rendez-vous déjà clos sont repliés : en fin de journée, la liste du
  // jour est une colonne de trente lignes sur lesquelles il n'y a plus rien à
  // faire, et ce qui reste à faire se perd dedans.
  const [passesOuverts, setPassesOuverts] = useState(false)
  // Rendez-vous touché dans le calendrier : on ouvre ses actions SUR PLACE.
  // Renvoyer vers la liste obligeait à retrouver la ligne, et faisait perdre
  // la vue d'ensemble qu'on était justement venu chercher.
  const [actionsFor, setActionsFor] = useState<Apt | null>(null)
  const [grain, setGrain] = useState<'jour' | 'semaine' | 'mois'>('semaine')
  const [plageAppts, setPlageAppts] = useState<Apt[]>([])
  const [plageBlocks, setPlageBlocks] = useState<Block[]>([])
  const [plageLoading, setPlageLoading] = useState(false)
  const [workingHours, setWorkingHours] = useState<WorkingHours | null>(null)
  const [appts, setAppts] = useState<Apt[]>([])
  const [types, setTypes] = useState<CType[]>([])
  // Les fauteuils du cabinet, renvoyés par l'agenda lui-même : la secrétaire
  // PLACE un rendez-vous sur un poste, elle ne crée pas les postes.
  const [postes, setPostes] = useState<Poste[]>([])
  const [posteId, setPosteId] = useState(NO_POSTE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Dialog nouveau RDV
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ time: '', notes: '' })
  // Patient du RDV : fiche existante choisie dans la liste, ou nouvelle fiche
  const [patient, setPatient] = useState<PatientChoice>(null)
  const [typeId, setTypeId] = useState(NO_TYPE)
  const [recurFreq, setRecurFreq] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none')
  const [recurCount, setRecurCount] = useState(4)
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [doctorId, setDoctorId] = useState('')

  // Encaissement inline (aligné sur le médecin : total dû + reste à payer)

  // Blocage de créneau
  const [blocks, setBlocks] = useState<Block[]>([])
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockFullDay, setBlockFullDay] = useState(false)
  const [blockStart, setBlockStart] = useState('13:00')
  const [blockEnd, setBlockEnd] = useState('14:00')
  const [blockReason, setBlockReason] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState('')

  // Déplacer un RDV
  const [moveFor, setMoveFor] = useState<Apt | null>(null)
  const [moveDate, setMoveDate] = useState('')
  const [moveTime, setMoveTime] = useState('')
  const [moveSlots, setMoveSlots] = useState<{ time: string; available: boolean }[]>([])
  const [moveLoadingSlots, setMoveLoadingSlots] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState('')

  const load = useCallback(async (d: string, silencieux = false) => {
    // Le rafraîchissement automatique ne remet pas les squelettes : un écran
    // qui clignote pendant qu'on le lit finit par ne plus être regardé.
    if (!silencieux) setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/cabinet/appointments?date=${d}`)
      if (!res.ok) { setError('Impossible de charger l\'agenda.'); return }
      const data = await res.json()
      setAppts(data.appointments ?? [])
      setTypes(data.consultationTypes ?? [])
      setPostes(data.postes ?? [])
      if (data.workingHours) setWorkingHours(data.workingHours as WorkingHours)
    } catch {
      setError('Erreur réseau.')
    } finally {
      if (!silencieux) setLoading(false)
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])
  // Changer de jour referme le repli : on ouvre un jour sur ce qu'il reste à
  // y faire, pas sur ce qu'on avait déplié la veille.
  useEffect(() => { setPassesOuverts(false) }, [date])

  // L'agenda du jour bouge sans elle : le médecin ouvre un dossier, demande un
  // patient, laisse une consigne. Rythme court quand l'écran est regardé,
  // rien quand il ne l'est pas, et rafraîchissement immédiat au retour sur
  // l'onglet — voir lib/rafraichissement.
  useRafraichissement(() => { if (date === aujourdhui) load(date, true) })

  const jourCourant = new Date(date + 'T12:00:00')
  const debutSemaine = startOfWeek(jourCourant, { weekStartsOn: 1 })

  // La grille du mois va du lundi précédant le 1er au dimanche suivant le
  // dernier : 42 cases, qui débordent sur les mois voisins.
  const grilleMois = (() => {
    const premier = startOfMonth(jourCourant)
    const decalage = (getDay(premier) + 6) % 7 // lundi = 0
    const debut = subDays(premier, decalage)
    return Array.from({ length: 42 }, (_, i) => addDays(debut, i))
  })()

  /** Les rendez-vous ET les fermetures d'une plage de dates.
   *
   *  L'API refuse plus de 31 jours d'un coup — une borne posée exprès, pour
   *  qu'on ne puisse pas redemander l'année entière et reconstituer les
   *  recettes. La grille du mois en fait 42, on la demande donc en deux fois
   *  plutôt que de desserrer le verrou. Sans ça, les jours des mois voisins
   *  s'affichaient vides alors qu'ils ne l'étaient pas. */
  const loadPlage = useCallback(async (jours: Date[]) => {
    setPlageLoading(true)
    try {
      const moitie = Math.ceil(jours.length / 2)
      const tranches = jours.length <= 31 ? [jours] : [jours.slice(0, moitie), jours.slice(moitie)]
      const reponses = await Promise.all(tranches.map(async (t) => {
        const from = format(t[0], 'yyyy-MM-dd')
        const to = format(t[t.length - 1], 'yyyy-MM-dd')
        const res = await fetch(`/api/cabinet/appointments?from=${from}&to=${to}`)
        return res.ok ? res.json() : { appointments: [], blocks: [] }
      }))
      setPlageAppts(reponses.flatMap((d) => d.appointments ?? []))
      setPlageBlocks(reponses.flatMap((d) => d.blocks ?? []))
    } catch { /* silencieux */ } finally { setPlageLoading(false) }
  }, [])

  useEffect(() => {
    if (mode !== 'calendrier') return
    if (grain === 'semaine') loadPlage(eachDayOfInterval({ start: debutSemaine, end: endOfWeek(jourCourant, { weekStartsOn: 1 }) }))
    else if (grain === 'mois') loadPlage(grilleMois)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, grain, date, loadPlage])

  const loadBlocks = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/cabinet/blocks?date=${d}`)
      if (res.ok) { const data = await res.json(); setBlocks(data.blocks ?? []) }
    } catch { /* silencieux */ }
  }, [])
  useEffect(() => { loadBlocks(date) }, [date, loadBlocks])

  async function addBlock() {
    setBlockError(''); setBlocking(true)
    try {
      const res = await fetch('/api/cabinet/blocks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, full_day: blockFullDay, start_time: blockStart, end_time: blockEnd, reason: blockReason || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setBlockError(data.error || 'Échec du blocage.'); return }
      setBlockOpen(false); setBlockReason('')
      await loadBlocks(date)
    } catch {
      setBlockError('Erreur réseau.')
    } finally {
      setBlocking(false)
    }
  }

  async function removeBlock(id: string) {
    const res = await fetch(`/api/cabinet/blocks?id=${id}`, { method: 'DELETE' })
    if (res.ok) setBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  // Le doctor_id sert uniquement à interroger l'API publique des créneaux.
  useEffect(() => {
    fetch('/api/cabinet/context').then((r) => r.ok ? r.json() : null).then((d) => d && setDoctorId(d.doctorId)).catch(() => {})
  }, [])

  // Créneaux dispo pour le dialog (API publique /api/slots)
  useEffect(() => {
    if (!addOpen || !doctorId) { setSlots([]); return }
    setLoadingSlots(true)
    const typeParam = typeId !== NO_TYPE ? `&type=${typeId}` : ''
    // Le poste compte autant que la durée : un créneau pris sur le fauteuil 1
    // reste libre sur le fauteuil 2.
    const posteParam = posteId !== NO_POSTE ? `&poste=${posteId}` : ''
    fetch(`/api/slots?doctor_id=${doctorId}&date=${date}${typeParam}${posteParam}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }, [addOpen, doctorId, date, typeId, posteId])

  const availableSlots = slots.filter((s) => s.available)

  async function createRdv(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (!patient) { setAddError('Choisissez un patient existant ou renseignez ses coordonnées.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/cabinet/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(patient && 'patientId' in patient && patient.patientId
            ? { patient_id: patient.patientId }
            : patient?.newPatient ?? {}),
          date,
          consultation_type_id: typeId !== NO_TYPE ? typeId : undefined,
          poste_id: posteId !== NO_POSTE ? posteId : undefined,
          recurrence: recurFreq !== 'none' ? { freq: recurFreq, count: recurCount } : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAddError(data.error || 'Erreur lors de la création'); return }
      // Récurrence : informer du nombre créé et des occurrences ignorées (créneaux pris)
      if (recurFreq !== 'none') {
        const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0
        alert(`${data.created ?? 1} rendez-vous créés${skipped > 0 ? ` · ${skipped} ignoré(s) (créneau déjà pris — à replacer à la main)` : ''}.`)
      }
      setAddOpen(false)
      setForm({ time: '', notes: '' }); setPatient(null)
      setTypeId(NO_TYPE); setPosteId(NO_POSTE)
      setRecurFreq('none'); setRecurCount(4)
      await load(date)
    } catch {
      setAddError('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  // ── Patient sans RDV (walk-in) ──
  async function searchWalkInPatients(q: string): Promise<PatientLite[]> {
    let list = patientCache
    if (!list) {
      const res = await fetch('/api/cabinet/patients')
      const data = res.ok ? await res.json() : { patients: [] }
      list = (data.patients ?? []) as PatientLite[]
      setPatientCache(list)
    }
    const ql = q.toLowerCase()
    return list.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(ql) || (p.phone ?? '').includes(q)).slice(0, 8)
  }
  async function addWalkIn(arg: { patientId?: string; newPatient?: { first_name: string; last_name: string; phone: string } }) {
    const res = await fetch('/api/cabinet/appointments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walk_in: true, patient_id: arg.patientId, ...arg.newPatient }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Échec de l\'ajout') }
    setPatientCache(null)
    setDate(format(getNowInMaroc(), 'yyyy-MM-dd'))
    await load(format(getNowInMaroc(), 'yyyy-MM-dd'))
  }

  async function patchRdv(id: string, patch: Record<string, unknown>) {
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || 'Échec de la modification'); return false }
    // Le serveur renvoie la ligne telle qu'il la relit — mais son select ne
    // contient PAS les colonnes de la v76/v77 (appel du suivant, consigne de
    // reprogrammation). Fusionner la réponse seule laissait donc l'ancienne
    // valeur en place : le bandeau « le médecin demande le suivant » restait
    // à l'écran après « C'est fait », jusqu'au rafraîchissement automatique
    // trente secondes plus tard. D'où l'impression qu'il marchait une fois
    // sur deux.
    //
    // On applique en plus ce qu'on a demandé, mais SEULEMENT pour les champs
    // que la réponse ne porte pas : le serveur reste maître de ceux qu'il
    // renvoie (il normalise des montants, par exemple).
    const absentsDeLaReponse = Object.fromEntries(
      Object.entries(patch).filter(([cle]) => !(cle in data)),
    )
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...data, ...absentsDeLaReponse } : a)))
    return true
  }


  // Créneaux dispo pour le déplacement
  useEffect(() => {
    if (!moveFor || !moveDate || !doctorId) { setMoveSlots([]); return }
    setMoveLoadingSlots(true)
    const typeParam = moveFor.consultation_type_id ? `&type=${moveFor.consultation_type_id}` : ''
    fetch(`/api/slots?doctor_id=${doctorId}&date=${moveDate}${typeParam}`)
      .then((r) => r.json()).then((d) => setMoveSlots(d.slots ?? [])).finally(() => setMoveLoadingSlots(false))
  }, [moveFor, moveDate, doctorId])

  async function confirmMoveRdv() {
    if (!moveFor || !moveDate || !moveTime) return
    setMoving(true); setMoveError('')
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: moveFor.id, date: moveDate, time: moveTime }),
    })
    const d = await res.json().catch(() => ({}))
    setMoving(false)
    if (!res.ok) { setMoveError(d.error || 'Échec du déplacement.'); return }
    setMoveFor(null)
    await load(date)
  }

  /** Déplacement par glissement, depuis le calendrier. Le serveur reste juge :
   *  s'il refuse — créneau pris, cabinet fermé — on le DIT au lieu de laisser
   *  le rendez-vous revenir silencieusement à sa place, ce qui ferait croire
   *  que le geste n'a pas été compris. */
  async function deplacerDepuisCalendrier(a: Apt, jour: string, heure: string) {
    setError('')
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, date: jour, time: heure }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Déplacement refusé.'); return }
    await rechargerCalendrier()
  }

  /** Après une écriture : la liste du jour ET la plage affichée. Sans la
   *  seconde, le rendez-vous déplacé restait à son ancienne place dans la
   *  grille jusqu'au prochain changement de semaine. */
  async function rechargerCalendrier() {
    await load(date)
    if (mode === 'calendrier' && grain !== 'jour') {
      await loadPlage(grain === 'mois' ? grilleMois
        : eachDayOfInterval({ start: debutSemaine, end: endOfWeek(jourCourant, { weekStartsOn: 1 }) }))
    }
  }

  const dayShift = (n: number) => setDate(format(addDays(new Date(date + 'T12:00:00'), n), 'yyyy-MM-dd'))

  // Les flèches avancent de ce que l'écran montre : un jour sur la liste, une
  // semaine sur la semaine, un mois sur le mois. Avancer d'un jour en vue Mois
  // ne faisait rien de visible onze fois sur douze.
  const decaler = (sens: 1 | -1) => {
    if (mode === 'calendrier' && grain === 'mois') {
      setDate(format(addMonths(jourCourant, sens), 'yyyy-MM-dd'))
    } else if (mode === 'calendrier' && grain === 'semaine') {
      dayShift(7 * sens)
    } else {
      dayShift(sens)
    }
  }

  const titrePeriode = mode === 'calendrier' && grain === 'mois'
    ? format(jourCourant, 'MMMM yyyy', { locale: fr })
    : mode === 'calendrier' && grain === 'semaine'
    ? `${format(debutSemaine, 'd', { locale: fr })} – ${format(endOfWeek(jourCourant, { weekStartsOn: 1 }), 'd MMM', { locale: fr })}`
    : `${format(jourCourant, 'EEEE d MMMM', { locale: fr })}${date === aujourdhui ? " · aujourd'hui" : ''}`
  const active = appts.filter((a) => a.status !== 'cancelled')
  const cancelled = appts.filter((a) => a.status === 'cancelled')

  /** Le patient est passé par le cabinet : arrivé, reçu, ou reparti. À partir
   *  de là, tout se joue au poste d'accueil — l'agenda n'a plus qu'à le
   *  constater. */
  const dejaPasse = (a: Apt) =>
    a.queue_status === 'arrive' || a.queue_status === 'en_consultation' || a.queue_status === 'parti'

  /** Le rendez-vous est CLOS : il n'y a plus rien à en attendre.
   *
   *  Soit le patient est reparti, soit il a été noté absent, soit son heure
   *  est dépassée d'une bonne heure sans qu'il se soit présenté. Une heure et
   *  pas dix minutes : entre les deux, il est simplement en retard, la ligne
   *  le dit toute seule, et la secrétaire peut encore vouloir l'appeler. */
  const estClos = (a: Apt) =>
    a.queue_status === 'parti'
    || a.attendance === 'absent'
    || (!a.queue_status && (retardMinutes(a, getNowInMaroc()) ?? 0) > 60)

  const clos = active.filter(estClos)
  // Les urgences remontent en tête : la secrétaire parcourt sa colonne de
  // noms, et c'est le premier regard qui doit tomber dessus.
  const parUrgence = (l: Apt[]) => [...l].sort((x, y) => Number(!!y.urgent) - Number(!!x.urgent))
  const visibles = parUrgence(passesOuverts ? active : active.filter((a) => !estClos(a)))

  // Le médecin réclame le patient suivant. On ne retient que les appels
  // récents : un appel d'il y a une heure n'est plus une demande, c'est du
  // bruit — et un bandeau rouge permanent cesse d'être vu.
  // Sans la permission « présences », le serveur refusera d'effacer l'appel :
  // montrer la bannière mènerait à un bouton « C'est fait » qui alerte et ne
  // fait rien, sans autre moyen de la faire taire.
  const appels = !permissions.mark_attendance ? [] : appts.filter((a) => {
    const m = minutesDepuis(a.appel_suivant_le)
    return m != null && m <= APPEL_VALIDE_MIN
  })

  return (
    <div className="space-y-4">
      {/* « Faites entrer le suivant » — en haut, au-dessus de tout : c'est la
          seule information de cet écran qui demande un geste dans la minute. */}
      {appels.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-primary-500 text-white rounded-xl px-4 py-3">
          <BellRing className="h-5 w-5 shrink-0" />
          <span className="text-sm font-semibold flex-1 min-w-0">
            Le médecin demande le patient suivant.
          </span>
          <button
            onClick={() => appels.forEach((a) => patchRdv(a.id, { appel_suivant_le: null }))}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition"
          >
            C&apos;est fait
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Le rôle de l'écran, écrit — son pendant est sur la salle
            d'attente. Deux écrans qui se ressemblent et dont on doit deviner
            la différence, c'est deux écrans qu'on ouvre au hasard. */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary-500" /> Agenda
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">La vue d’ensemble : créer, déplacer, la semaine.</p>
        </div>
        {permissions.manage_appointments && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setWalkInOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Sans RDV
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
              <FileText className="h-4 w-4 mr-1" /> Feuille de route
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setBlockError(''); setBlockFullDay(false); setBlockOpen(true) }}>
              <Ban className="h-4 w-4 mr-1" /> Bloquer un créneau
            </Button>
            <Button size="sm" onClick={() => { setAddError(''); setAddOpen(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Nouveau RDV
            </Button>
          </div>
        )}
      </div>

      {/* Navigation + bascule Liste / Calendrier */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => decaler(-1)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="Précédent"><ChevronLeft className="h-4 w-4" /></button>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
        <button onClick={() => decaler(1)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="Suivant"><ChevronRight className="h-4 w-4" /></button>
        <span className="text-sm text-gray-500 capitalize ml-1">{titrePeriode}</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Le grain n'apparaît QUE dans le calendrier : il ne veut rien dire
              sur la liste, qui est toujours celle d'une journée. */}
          {mode === 'calendrier' && (
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
              {(['jour', 'semaine', 'mois'] as const).map((g) => (
                <button key={g} onClick={() => setGrain(g)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition capitalize ${grain === g ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            {([['liste', 'Liste'], ['calendrier', 'Calendrier']] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${mode === m ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'liste' && blocks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {blocks.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2 py-1">
              <Ban className="h-3 w-3" />
              {b.start_time ? `${String(b.start_time).substring(0, 5)}–${String(b.end_time).substring(0, 5)}` : 'Journée entière'}
              {b.reason ? ` · ${b.reason}` : ''}
              {permissions.manage_appointments && (
                <button onClick={() => removeBlock(b.id)} className="hover:text-amber-900" aria-label="Débloquer"><X className="h-3 w-3" /></button>
              )}
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}

      {mode === 'calendrier' ? (
        plageLoading && grain !== 'jour' ? (
          <div className="h-80 bg-gray-100 rounded-xl animate-pulse" />
        ) : grain === 'mois' ? (
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <MonthGrid
              days={grilleMois}
              month={jourCourant}
              appointments={plageAppts as never}
              blocks={plageBlocks}
              onSelectDay={(d) => { setDate(format(d, 'yyyy-MM-dd')); setMode('liste') }}
              onSelectAppointment={(a) => { setDate((a as unknown as Apt).date); setMode('liste') }}
            />
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <WeekGrid
              weekStart={grain === 'jour' ? jourCourant : debutSemaine}
              nbJours={grain === 'jour' ? 1 : 7}
              appointments={(grain === 'jour' ? appts : plageAppts) as never}
              blocks={grain === 'jour' ? blocks : plageBlocks}
              workingHours={workingHours ?? HORAIRES_PAR_DEFAUT}
              defaultDuration={30}
              onSelectDay={(d) => { setDate(format(d, 'yyyy-MM-dd')); setMode('liste') }}
              onSelectAppointment={(a) => setActionsFor(a as unknown as Apt)}
              // Créer et déplacer depuis la grille — seulement si elle en a le
              // droit : sans la permission, la grille reste en lecture.
              onCreate={permissions.manage_appointments ? (jour, heure) => {
                setDate(jour); setAddError(''); setForm({ time: heure, notes: '' })
                setPatient(null); setTypeId(NO_TYPE); setPosteId(NO_POSTE); setAddOpen(true)
              } : undefined}
              onMove={permissions.manage_appointments ? (a, jour, heure) => {
                deplacerDepuisCalendrier(a as unknown as Apt, jour, heure)
              } : undefined}
            />
          </div>
        )
      ) : loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : active.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" /> Aucun rendez-vous ce jour.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {/* La ligne de chargement est EN HAUT : les rendez-vous clos sont
              ceux du début de journée, c'est là qu'ils reprennent leur place
              quand on les déplie. */}
          {clos.length > 0 && (
            <button
              onClick={() => setPassesOuverts(!passesOuverts)}
              className="w-full text-center text-xs text-gray-400 hover:text-primary-600 py-2.5 transition"
            >
              {passesOuverts
                ? 'Masquer les rendez-vous passés'
                : `Charger les ${clos.length} rendez-vous précédents`}
            </button>
          )}
          {visibles.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Plus rien d&apos;attendu aujourd&apos;hui.</p>
          )}
          {visibles.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3.5 flex-wrap">
              <div className="text-sm font-semibold text-gray-900 w-14 shrink-0">{formatTime(a.time)}</div>
              <div className="flex-1 min-w-[160px]">
                {/* Les consignes du cabinet se lisent À CÔTÉ DU NOM, pas en
                    bas de ligne : la secrétaire parcourt sa colonne de noms,
                    c'est là que son œil passe. Chaque mention porte son propre
                    geste, et disparaît une fois le geste fait. */}
                <p className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                  <span className="truncate">{a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}</span>
                  {/* C'est ICI qu'on coche, parce que c'est ici qu'on répond au
                      téléphone. La pastille se clique pour se mettre et se
                      retirer : une urgence annoncée qui n'en était pas une doit
                      pouvoir redevenir un rendez-vous ordinaire. */}
                  {permissions.manage_appointments ? (
                    <button
                      onClick={() => patchRdv(a.id, { urgent: !a.urgent })}
                      title={a.urgent ? 'Retirer l’urgence' : 'Marquer urgent'}
                      className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full transition ${
                        a.urgent ? 'bg-red-600 text-white' : 'border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500'
                      }`}
                    >
                      Urgent
                    </button>
                  ) : a.urgent ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-1.5 py-0.5 rounded-full">Urgent</span>
                  ) : null}
                  {a.walk_in && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Sans RDV</span>}

                  {/* UNE seule étiquette d'état, la même règle que chez le
                      médecin (lib/file-attente). « Présent » ne cohabite plus
                      avec « Attend depuis » : c'était deux mots pour un fait,
                      et « Présent » survivait à la consultation. */}
                  {etatPatient(a) && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${etatPatient(a)!.couleur}`}>
                      {etatPatient(a)!.label}
                    </span>
                  )}

                  {/* Ce qui vient du médecin : on le LIT, et seulement tant
                      que le patient est encore attendu. Une consigne sur
                      quelqu'un reparti il y a trois heures n'est plus une
                      information, c'est une ligne de plus à relire. On y
                      répond au poste d'accueil, pas d'ici. */}
                  {!dejaPasse(a) && resumeEchange(a as never) && (
                    <span className="text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full max-w-[260px] truncate">
                      {resumeEchange(a as never)}
                    </span>
                  )}

                </p>
                <p className="text-xs text-gray-500 truncate">
                  {a.consultation_type?.name || a.notes || 'Consultation'}
                  {permissions.patients_contact && a.patient?.phone ? ` · ${a.patient.phone}` : ''}
                </p>
              </div>

              {/* ── L'AGENDA EST UNE VUE D'ENSEMBLE ──────────────────────
                  Chaque ligne portait jusqu'à cinq icônes de pointage, un
                  encaissement, un panneau pour écrire au médecin, un
                  déplacement et une annulation. Sur un patient reparti depuis
                  trois heures, tout cela ne servait à rien et il fallait le
                  relire à chaque ligne.

                  Ce qui se fait AU PASSAGE du patient — le faire entrer,
                  l'encaisser, écrire au médecin — se fait au poste d'accueil,
                  dans la salle d'attente. Ici on prépare et on organise. */}

              {dejaPasse(a) ? (
                /* Il est venu : la vue d'ensemble n'a plus qu'à le constater.
                   Le montant reste, en texte : c'est le seul chiffre qui dise
                   ce qu'a rapporté la journée. */
                a.amount_paid != null ? (
                  // Le MONTANT n'apparaît qu'avec « Journal de caisse du
                  // jour ». Sans cette condition, une secrétaire à qui le
                  // médecin a refusé le journal n'avait qu'à additionner sa
                  // colonne pour obtenir exactement le chiffre qu'on voulait
                  // lui cacher. Elle encaisse en salle d'attente, où elle voit
                  // ce que CE patient doit : c'est le cumul qu'on protège.
                  permissions.caisse_day ? (
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {a.amount_paid} DH{a.payment_method ? ` · ${PAYMENT_METHOD_LABELS[a.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? a.payment_method}` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-green-600 whitespace-nowrap">Réglé</span>
                  )
                ) : a.quote_id ? (
                  <span className="text-xs text-gray-500 whitespace-nowrap">Réglé via le devis</span>
                ) : null
              ) : (
                <>
                  {/* Pas encore là : on le pointe à son arrivée, on le note en
                      retard, on le déplace, on annule. Rien d'autre. */}
                  {permissions.mark_attendance && (
                    <BoutonsFile
                      queueStatus={a.queue_status}
                      attendance={a.attendance}
                      onQueue={(key) => patchRdv(a.id, { queue_status: key })}
                      onAttendance={(key) => patchRdv(a.id, { attendance: key })}
                      reduit
                    />
                  )}

                  {permissions.manage_appointments && a.amount_paid == null && (
                    <button
                      onClick={() => { setMoveError(''); setMoveFor(a); setMoveDate(''); setMoveTime('') }}
                      className="flex items-center gap-1 text-xs text-primary-600 border border-primary-200 rounded-lg px-2 py-1 hover:bg-primary-50"
                    >
                      <CalendarClock className="h-3.5 w-3.5" /> Déplacer
                    </button>
                  )}

                  {permissions.manage_appointments && a.amount_paid == null && (
                    <button
                      onClick={() => { if (confirm('Annuler ce rendez-vous ?')) patchRdv(a.id, { status: 'cancelled' }) }}
                      className="text-xs text-gray-400 hover:text-red-500 px-1"
                    >
                      Annuler
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'liste' && cancelled.length > 0 && (
        <p className="text-[11px] text-gray-400">{cancelled.length} RDV annulé(s) ce jour.</p>
      )}

      {/* Dialog nouveau RDV */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau rendez-vous — {format(new Date(date + 'T12:00:00'), 'd MMMM', { locale: fr })}</DialogTitle></DialogHeader>
          <form onSubmit={createRdv} className="space-y-4">
            <PatientPicker onSearch={searchWalkInPatients} onChange={setPatient} showBirthDate />
            {types.length > 0 && (
              <div className="space-y-1.5">
                <Label>Motif</Label>
                <Select value={typeId} onValueChange={(v) => { setTypeId(v); setForm((f) => ({ ...f, time: '' })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TYPE}>Durée standard</SelectItem>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.duration_minutes ? ` · ${t.duration_minutes} min` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Le fauteuil (v89). Un seul poste déclaré ne mérite pas de
                sélecteur : il n'y a rien à choisir. */}
            {posteUtile(postes) && (
              <div className="space-y-1.5">
                <Label>Fauteuil / salle</Label>
                <Select value={posteId} onValueChange={(v) => { setPosteId(v); setForm((f) => ({ ...f, time: '' })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_POSTE}>Sans poste précisé</SelectItem>
                    {posteActifs(postes).map((p) => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-400">
                  Les heures proposées tiennent compte du poste choisi.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Heure *</Label>
              <Select value={form.time} onValueChange={(v) => setForm({ ...form, time: v })} disabled={loadingSlots || availableSlots.length === 0}>
                <SelectTrigger><SelectValue placeholder={loadingSlots ? 'Chargement…' : 'Choisir une heure'} /></SelectTrigger>
                <SelectContent>
                  {availableSlots.map((s) => <SelectItem key={s.time} value={s.time}>{s.time}</SelectItem>)}
                </SelectContent>
              </Select>
              {!loadingSlots && availableSlots.length === 0 && (
                <p className="text-xs text-red-500">Aucun créneau disponible ce jour.</p>
              )}
            </div>
            {/* Récurrence : même heure, répétée sur plusieurs semaines/mois */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Répéter</Label>
                <Select value={recurFreq} onValueChange={(v) => setRecurFreq(v as typeof recurFreq)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Rendez-vous unique</SelectItem>
                    <SelectItem value="weekly">Chaque semaine</SelectItem>
                    <SelectItem value="biweekly">Toutes les 2 semaines</SelectItem>
                    <SelectItem value="monthly">Chaque mois</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {recurFreq !== 'none' && (
                <div className="space-y-1.5">
                  <Label>Nombre de séances</Label>
                  <Input type="number" min={2} max={26} value={recurCount}
                    onChange={(e) => setRecurCount(Math.min(26, Math.max(2, Number(e.target.value) || 2)))} />
                </div>
              )}
            </div>
            {recurFreq !== 'none' && (
              <p className="text-xs text-gray-500 -mt-1">
                {recurCount} rendez-vous à {form.time || '—'}, {recurFreq === 'weekly' ? 'chaque semaine' : recurFreq === 'biweekly' ? 'toutes les 2 semaines' : 'chaque mois'}. Chacun reste déplaçable indépendamment.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="c_notes">Notes (optionnel)</Label>
              <Input id="c_notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Précisions…" />
            </div>
            {addError && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{addError}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={saving || !form.time}>{saving ? 'Création…' : 'Créer le RDV'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog déplacer */}
      {/* Les actions d'un rendez-vous touché dans le calendrier. Trois gestes,
          nommés : ouvrir, déplacer, annuler — sans quitter le calendrier.
          Renvoyer vers la liste obligeait à retrouver la ligne, et faisait
          perdre la vue d'ensemble qu'on était venu chercher. */}
      <Dialog open={!!actionsFor} onOpenChange={(o) => !o && setActionsFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionsFor?.patient ? `${actionsFor.patient.first_name} ${actionsFor.patient.last_name}` : 'Rendez-vous'}
            </DialogTitle>
          </DialogHeader>
          {actionsFor && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 capitalize">
                {format(new Date(actionsFor.date + 'T12:00:00'), 'EEEE d MMMM', { locale: fr })} à {formatTime(actionsFor.time)}
                {actionsFor.consultation_type?.name ? ` · ${actionsFor.consultation_type.name}` : ''}
              </p>
              <Button variant="outline" className="w-full justify-start"
                onClick={() => { const a = actionsFor; setActionsFor(null); setDate(a.date); setMode('liste') }}>
                Voir dans la liste du jour
              </Button>
              {permissions.manage_appointments && (
                <>
                  <Button variant="outline" className="w-full justify-start"
                    onClick={() => { const a = actionsFor; setActionsFor(null); setMoveError(''); setMoveFor(a); setMoveDate(''); setMoveTime('') }}>
                    <CalendarClock className="h-4 w-4 mr-2" /> Déplacer à une autre date
                  </Button>
                  <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700"
                    onClick={async () => {
                      const a = actionsFor
                      if (!confirm('Annuler ce rendez-vous ?')) return
                      setActionsFor(null)
                      await patchRdv(a.id, { status: 'cancelled' })
                      await rechargerCalendrier()
                    }}>
                    <X className="h-4 w-4 mr-2" /> Annuler le rendez-vous
                  </Button>
                  <p className="text-[11px] text-gray-400 pt-1">
                    Pour un simple changement d’heure, faites glisser le rendez-vous dans la grille.
                  </p>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveFor} onOpenChange={(o) => !o && setMoveFor(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Déplacer — {moveFor?.patient ? `${moveFor.patient.first_name} ${moveFor.patient.last_name}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Actuellement le {moveFor ? format(new Date(moveFor.date + 'T12:00:00'), 'd MMM', { locale: fr }) : ''} à {moveFor ? formatTime(moveFor.time) : ''}</p>
            <div className="space-y-1.5">
              <Label>Nouvelle date</Label>
              <Input type="date" value={moveDate} min={format(getNowInMaroc(), 'yyyy-MM-dd')} onChange={(e) => { setMoveDate(e.target.value); setMoveTime('') }} />
            </div>
            <div className="space-y-1.5">
              <Label>Nouvelle heure</Label>
              <Select value={moveTime || undefined} onValueChange={setMoveTime} disabled={!moveDate || moveLoadingSlots}>
                <SelectTrigger><SelectValue placeholder={!moveDate ? 'Choisir une date' : moveLoadingSlots ? 'Chargement…' : 'Choisir une heure'} /></SelectTrigger>
                <SelectContent>
                  {moveSlots.filter((s) => s.available).map((s) => <SelectItem key={s.time} value={s.time}>{s.time}</SelectItem>)}
                </SelectContent>
              </Select>
              {moveDate && !moveLoadingSlots && moveSlots.filter((s) => s.available).length === 0 && (
                <p className="text-xs text-red-500">Aucun créneau libre ce jour.</p>
              )}
            </div>
            {moveError && <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{moveError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setMoveFor(null)}>Annuler</Button>
            <Button type="button" onClick={confirmMoveRdv} disabled={moving || !moveDate || !moveTime}>{moving ? 'Déplacement…' : 'Déplacer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog patient sans RDV */}
      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} onSearch={searchWalkInPatients} onSubmit={addWalkIn} />

      {/* Dialog blocage de créneau */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Bloquer un créneau — {format(new Date(date + 'T12:00:00'), 'd MMM', { locale: fr })}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Le créneau devient indisponible en ligne et dans l&apos;agenda du médecin.</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={blockFullDay} onChange={(e) => setBlockFullDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              Bloquer toute la journée
            </label>
            {!blockFullDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>De</Label><Input type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>À</Label><Input type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} /></div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Motif (optionnel)</Label>
              <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ex : urgence, pause…" />
            </div>
            {blockError && <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{blockError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setBlockOpen(false)}>Annuler</Button>
            <Button type="button" onClick={addBlock} disabled={blocking}>{blocking ? 'Blocage…' : 'Bloquer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog encaissement — total dû + reste à payer + solder (aligné médecin) */}

      {sheetOpen && (
        <DaySheet
          doctorName={doctorName}
          date={date}
          items={active.map((a) => ({
            id: a.id,
            time: a.time,
            duration: a.duration_minutes ?? null,
            name: a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient',
            motif: a.consultation_type?.name || a.notes || null,
            phone: permissions.patients_contact ? a.patient?.phone ?? null : null,
            attendance: a.attendance ?? null,
            queue_status: a.queue_status ?? null,
            amount_paid: a.amount_paid ?? null,
            payment_method: a.payment_method ?? null,
          }))}
          blocks={blocks}
          showPhone={permissions.patients_contact}
          showMoney={permissions.payments}
          showTotal={permissions.caisse_day}
          onClose={() => setSheetOpen(false)}
        />
      )}

    </div>
  )
}
