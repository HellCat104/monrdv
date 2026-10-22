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
import { etatPatient, resumeEchange } from '@/lib/file-attente'
import BoutonsFile from '@/components/cabinet/BoutonsFile'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Plus, X, ChevronLeft, ChevronRight, CalendarClock, Ban, BellRing } from 'lucide-react'
import { PAYMENT_METHOD_LABELS, type StaffPermissions } from '@/types'
import DaySheet from '@/components/shared/DaySheet'
import { PatientPicker, type PatientChoice } from '@/components/shared/PatientPicker'
import { WalkInDialog, type PatientLite } from '@/components/dashboard/WalkInDialog'
import { FileText, UserPlus } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>


interface CType { id: string; name: string; duration_minutes: number | null; default_price: number | null }
const NO_TYPE = '__none__'

export default function AgendaClient({ permissions, doctorName = 'Cabinet médical' }: { permissions: StaffPermissions; doctorName?: string }) {
  const [date, setDate] = useState(() => format(getNowInMaroc(), 'yyyy-MM-dd'))
  const aujourdhui = format(getNowInMaroc(), 'yyyy-MM-dd')
  // Fil de messages ouvert sur un rendez-vous (v77)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [patientCache, setPatientCache] = useState<PatientLite[] | null>(null)
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')
  const [weekAppts, setWeekAppts] = useState<Apt[]>([])
  const [weekLoading, setWeekLoading] = useState(false)
  const [appts, setAppts] = useState<Apt[]>([])
  const [types, setTypes] = useState<CType[]>([])
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
  type Block = { id: string; date: string; start_time: string | null; end_time: string | null; reason: string | null }
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
    } catch {
      setError('Erreur réseau.')
    } finally {
      if (!silencieux) setLoading(false)
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])

  // L'agenda du jour bouge sans elle : le médecin ouvre un dossier, demande un
  // patient, laisse une consigne. Trente secondes — c'est le poste d'accueil,
  // la minute de retard s'y voit tout de suite.
  useEffect(() => {
    if (date !== aujourdhui) return
    const t = setInterval(() => load(date, true), 30000)
    return () => clearInterval(t)
  }, [date, aujourdhui, load])

  // Vue semaine : lundi -> dimanche contenant la date courante
  const weekDays = eachDayOfInterval({
    start: startOfWeek(new Date(date + 'T12:00:00'), { weekStartsOn: 1 }),
    end: endOfWeek(new Date(date + 'T12:00:00'), { weekStartsOn: 1 }),
  })
  const loadWeek = useCallback(async (d: string) => {
    setWeekLoading(true)
    try {
      const base = new Date(d + 'T12:00:00')
      const from = format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const to = format(endOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const res = await fetch(`/api/cabinet/appointments?from=${from}&to=${to}`)
      if (res.ok) { const data = await res.json(); setWeekAppts(data.appointments ?? []) }
    } catch { /* silencieux */ } finally { setWeekLoading(false) }
  }, [])
  useEffect(() => { if (viewMode === 'week') loadWeek(date) }, [viewMode, date, loadWeek])

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
    fetch(`/api/slots?doctor_id=${doctorId}&date=${date}${typeParam}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }, [addOpen, doctorId, date, typeId])

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
      setTypeId(NO_TYPE)
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

  const dayShift = (n: number) => setDate(format(addDays(new Date(date + 'T12:00:00'), n), 'yyyy-MM-dd'))
  const isToday = date === format(getNowInMaroc(), 'yyyy-MM-dd')
  const active = appts.filter((a) => a.status !== 'cancelled')
  const cancelled = appts.filter((a) => a.status === 'cancelled')

  /** Le patient est passé par le cabinet : arrivé, reçu, ou reparti. À partir
   *  de là, tout se joue au poste d'accueil — l'agenda n'a plus qu'à le
   *  constater. */
  const dejaPasse = (a: Apt) =>
    a.queue_status === 'arrive' || a.queue_status === 'en_consultation' || a.queue_status === 'parti'

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

      {/* Navigation + bascule Jour / Semaine */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => dayShift(viewMode === 'week' ? -7 : -1)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="Précédent"><ChevronLeft className="h-4 w-4" /></button>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
        <button onClick={() => dayShift(viewMode === 'week' ? 7 : 1)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="Suivant"><ChevronRight className="h-4 w-4" /></button>
        <span className="text-sm text-gray-500 capitalize ml-1">
          {viewMode === 'day'
            ? `${format(new Date(date + 'T12:00:00'), 'EEEE d MMMM', { locale: fr })}${isToday ? " · aujourd'hui" : ''}`
            : `${format(weekDays[0], 'd', { locale: fr })} – ${format(weekDays[6], 'd MMM', { locale: fr })}`}
        </span>
        <div className="ml-auto inline-flex rounded-lg border border-gray-200 p-0.5">
          {(['day', 'week'] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${viewMode === m ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {m === 'day' ? 'Jour' : 'Semaine'}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'day' && blocks.length > 0 && (
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

      {viewMode === 'week' ? (
        weekLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {weekDays.map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const dStr = format(d, 'yyyy-MM-dd')
              const dayList = weekAppts
                .filter((a) => a.date === dStr && a.status !== 'cancelled')
                .sort((a, b) => String(a.time).localeCompare(String(b.time)))
              const today = isSameDay(d, getNowInMaroc())
              return (
                <button key={dStr} onClick={() => { setDate(dStr); setViewMode('day') }}
                  className={`text-left bg-white border rounded-xl p-2 min-h-[8rem] hover:border-primary-300 transition ${today ? 'border-primary-400' : 'border-gray-100'}`}>
                  <div className={`text-xs font-semibold mb-1.5 capitalize ${today ? 'text-primary-600' : 'text-gray-700'}`}>
                    {format(d, 'EEE d', { locale: fr })}
                  </div>
                  {dayList.length === 0 ? (
                    <p className="text-[11px] text-gray-300">—</p>
                  ) : (
                    <div className="space-y-1">
                      {dayList.slice(0, 6).map((a) => (
                        <div key={a.id} className="text-[11px] leading-tight bg-primary-50 text-primary-700 rounded px-1.5 py-0.5 truncate">
                          <span className="font-medium">{formatTime(a.time)}</span> {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : ''}
                        </div>
                      ))}
                      {dayList.length > 6 && <p className="text-[10px] text-gray-400">+{dayList.length - 6} autres</p>}
                    </div>
                  )}
                </button>
              )
            })}
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
          {active.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3.5 flex-wrap">
              <div className="text-sm font-semibold text-gray-900 w-14 shrink-0">{formatTime(a.time)}</div>
              <div className="flex-1 min-w-[160px]">
                {/* Les consignes du cabinet se lisent À CÔTÉ DU NOM, pas en
                    bas de ligne : la secrétaire parcourt sa colonne de noms,
                    c'est là que son œil passe. Chaque mention porte son propre
                    geste, et disparaît une fois le geste fait. */}
                <p className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                  <span className="truncate">{a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}</span>
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
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {a.amount_paid} DH{a.payment_method ? ` · ${PAYMENT_METHOD_LABELS[a.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? a.payment_method}` : ''}
                  </span>
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

      {viewMode === 'day' && cancelled.length > 0 && (
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
          onClose={() => setSheetOpen(false)}
        />
      )}

    </div>
  )
}
