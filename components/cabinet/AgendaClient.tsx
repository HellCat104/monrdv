'use client'

// Agenda interactif de la secrétaire : liste du jour, création de RDV,
// pointage des présences, encaissement et annulation — selon ses permissions.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getNowInMaroc, formatTime, formatAge } from '@/lib/utils'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Plus, Check, X, Clock, Banknote, ChevronLeft, ChevronRight, CalendarClock, Ban, BellRing, MessageSquare } from 'lucide-react'
import { ATTENDANCE_LABELS, ATTENDANCE_COLORS, PAYMENT_METHOD_LABELS, type StaffPermissions } from '@/types'
import DaySheet from '@/components/shared/DaySheet'
import { PatientPicker, type PatientChoice } from '@/components/shared/PatientPicker'
import { WalkInDialog, type PatientLite } from '@/components/dashboard/WalkInDialog'
import { FileText, UserPlus } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>

/** Minutes écoulées depuis un horodatage. null tant que la v76 n'est pas
 *  passée : l'écran n'affiche alors aucune durée, plutôt qu'un « 0 min » faux. */
function minutesDepuis(iso?: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.round((Date.now() - t) / 60000))
}

/** Un appel « faites entrer le suivant » est FUGACE : passé un quart d'heure,
 *  c'est un appel oublié, et un bandeau qui clignote jusqu'au soir ne se lit
 *  plus. L'écran l'ignore ; la colonne, elle, garde la trace. */
const APPEL_VALIDE_MIN = 15
interface CType { id: string; name: string; duration_minutes: number | null; default_price: number | null }
const NO_TYPE = '__none__'

export default function AgendaClient({ permissions, doctorName = 'Cabinet médical' }: { permissions: StaffPermissions; doctorName?: string }) {
  const [date, setDate] = useState(() => format(getNowInMaroc(), 'yyyy-MM-dd'))
  const aujourdhui = format(getNowInMaroc(), 'yyyy-MM-dd')
  // Fil de messages ouvert sur un rendez-vous (v77)
  const [motFor, setMotFor] = useState<Apt | null>(null)
  const [motTexte, setMotTexte] = useState('')
  const [motEnCours, setMotEnCours] = useState(false)
  const [motErreur, setMotErreur] = useState('')
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
  const [payFor, setPayFor] = useState<Apt | null>(null)
  const [payDue, setPayDue] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('especes')
  const [payError, setPayError] = useState('')

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
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
    return true
  }

  // Ouvre le dialog en pré-remplissant depuis le RDV (et le tarif du motif)
  function openPayDialog(a: Apt) {
    const price = types.find((t) => t.id === a.consultation_type_id)?.default_price ?? null
    const due = a.amount_due ?? price ?? null
    setPayError('')
    setPayDue(due != null ? String(due) : '')
    setPayAmount(a.amount_paid != null ? String(a.amount_paid) : (due != null ? String(due) : ''))
    setPayMethod(a.payment_method ?? 'especes')
    setPayFor(a)
  }

  async function savePayment() {
    if (!payFor) return
    const paid = parseFloat(payAmount.replace(',', '.'))
    if (isNaN(paid) || paid < 0) { setPayError('Montant encaissé invalide.'); return }
    const dueRaw = payDue.trim()
    const due = dueRaw === '' ? null : parseFloat(dueRaw.replace(',', '.'))
    if (due !== null && (isNaN(due) || due < 0)) { setPayError('Total dû invalide.'); return }
    setPayError('')
    const ok = await patchRdv(payFor.id, { amount_paid: paid, amount_due: due, payment_method: payMethod })
    if (ok) { setPayFor(null); setPayAmount(''); setPayDue('') }
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

  // Le médecin réclame le patient suivant. On ne retient que les appels
  // récents : un appel d'il y a une heure n'est plus une demande, c'est du
  // bruit — et un bandeau rouge permanent cesse d'être vu.
  const appels = appts.filter((a) => {
    const m = minutesDepuis(a.appel_suivant_le)
    return m != null && m <= APPEL_VALIDE_MIN
  })

  async function envoyerMot() {
    if (!motFor || !motTexte.trim()) return
    setMotEnCours(true)
    setMotErreur('')
    try {
      const res = await fetch('/api/cabinet/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: motFor.id, contenu: motTexte.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMotErreur(d.error || 'Envoi impossible.'); return }
      // On recharge l'agenda plutôt que de bricoler la liste à la main : le
      // médecin a pu répondre entre-temps, et son mot doit apparaître aussi.
      setMotTexte('')
      await load(date, true)
      setMotFor((prev) => prev ? { ...prev, mots: [...(prev.mots ?? []), d.message] } : prev)
    } catch {
      setMotErreur('Erreur réseau.')
    } finally {
      setMotEnCours(false)
    }
  }

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
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary-500" /> Agenda
        </h1>
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

                  {/* Attend depuis… — la durée, pas seulement le fait */}
                  {a.queue_status === 'arrive' && minutesDepuis(a.queue_arrived_at) != null && (
                    <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      Attend depuis {minutesDepuis(a.queue_arrived_at)} min
                    </span>
                  )}

                  {/* Le médecin a ouvert le dossier : il est avec lui */}
                  {a.queue_status === 'en_consultation' && (
                    <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      En consultation{minutesDepuis(a.queue_started_at) != null ? ` · ${minutesDepuis(a.queue_started_at)} min` : ''}
                    </span>
                  )}

                  {/* À reprogrammer : la consigne se solde ici même */}
                  {a.reprogrammer_jours != null && (
                    <button
                      onClick={() => patchRdv(a.id, { reprogrammer_jours: null })}
                      title="Marquer la consigne comme traitée"
                      className="text-[10px] font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    >
                      À revoir dans {a.reprogrammer_jours} j · fait ?
                    </button>
                  )}

                  {/* Un mot échangé avec le médecin (v77). On montre le
                      DERNIER, tronqué : dans un cabinet le mot fait six mots
                      (« elle demande à décaler à jeudi »), et le lire sans
                      cliquer est tout l'intérêt. Le bouton ouvre le fil. */}
                  {Array.isArray(a.mots) && a.mots.length > 0 && (
                    <button
                      onClick={() => { setMotFor(a); setMotTexte(''); setMotErreur('') }}
                      title="Ouvrir le fil avec le médecin"
                      className="text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 px-1.5 py-0.5 rounded-full max-w-[260px] truncate"
                    >
                      💬 {a.mots[a.mots.length - 1].auteur === 'medecin' ? 'Dr' : a.mots[a.mots.length - 1].auteur_nom?.split(' ')[0] || 'Moi'} : {a.mots[a.mots.length - 1].contenu}
                    </button>
                  )}

                  {/* Documents à remettre — un COMPTE, jamais le contenu : il
                      n'y a pas besoin de lire une ordonnance pour l'imprimer.

                      SEULEMENT TANT QUE LE PATIENT EST LÀ. « À remettre » est
                      une chose à faire maintenant : sur quelqu'un qui est parti
                      — ou qui n'a jamais été pointé à l'accueil — la mention
                      affirme un travail en attente qui n'existe pas, et un
                      badge qui ment finit par ne plus être lu du tout. */}
                  {(a.queue_status === 'arrive' || a.queue_status === 'en_consultation')
                    && typeof a.documents_a_remettre === 'number' && a.documents_a_remettre > 0 && (
                    <span className="text-[10px] font-semibold bg-primary-50 text-primary-700 border border-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {a.documents_a_remettre} document{a.documents_a_remettre > 1 ? 's' : ''} à remettre
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {a.consultation_type?.name || a.notes || 'Consultation'}
                  {permissions.patients_contact && a.patient?.phone ? ` · ${a.patient.phone}` : ''}
                </p>
              </div>

              {/* Présence */}
              {permissions.mark_attendance ? (
                <div className="flex items-center gap-1">
                  {([['present', Check], ['late', Clock], ['absent', X]] as const).map(([key, Icon]) => (
                    <button
                      key={key}
                      onClick={() => patchRdv(a.id, { attendance: a.attendance === key ? null : key })}
                      title={ATTENDANCE_LABELS[key]}
                      className={`p-1.5 rounded-lg border text-xs transition ${a.attendance === key ? ATTENDANCE_COLORS[key] + ' border-transparent' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              ) : a.attendance ? (
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${ATTENDANCE_COLORS[a.attendance as keyof typeof ATTENDANCE_COLORS] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ATTENDANCE_LABELS[a.attendance as keyof typeof ATTENDANCE_LABELS] ?? a.attendance}
                </span>
              ) : null}

              {/* RDV rattaché à un devis : l'argent de cette séance se saisit sur
                  le plan de traitement, par le médecin. Encaisser ici en plus
                  compterait la même somme deux fois — le serveur le refuse, et
                  on l'écrit ici pour que la secrétaire sache pourquoi le bouton
                  d'encaissement a disparu. */}
              {a.quote_id && (
                <span className="text-[11px] whitespace-nowrap rounded-full px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-100">
                  Réglé via le devis
                </span>
              )}

              {/* Paiement — total dû, reste à payer, paiement partiel (comme le médecin) */}
              {permissions.payments && !a.quote_id && (
                a.amount_paid != null ? (() => {
                  const reste = (a.amount_due ?? 0) - a.amount_paid
                  const partial = a.amount_due != null && reste > 0
                  return (
                    <button
                      onClick={() => openPayDialog(a)}
                      title={partial ? 'Solder le reste' : 'Modifier l\'encaissement'}
                      className={`text-xs whitespace-nowrap rounded-lg px-2 py-1 border ${partial ? 'text-orange-600 border-orange-200 hover:bg-orange-50' : 'text-gray-600 border-transparent hover:bg-gray-50'}`}
                    >
                      {partial
                        ? `${a.amount_paid}/${a.amount_due} DH · reste ${reste}`
                        : `✓ ${a.amount_paid} DH${a.payment_method ? ` · ${PAYMENT_METHOD_LABELS[a.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? a.payment_method}` : ''}`}
                    </button>
                  )
                })() : (
                  <button
                    onClick={() => openPayDialog(a)}
                    className="flex items-center gap-1 text-xs text-primary-600 border border-primary-200 rounded-lg px-2 py-1 hover:bg-primary-50"
                  >
                    <Banknote className="h-3.5 w-3.5" /> Encaisser
                  </button>
                )
              )}

              {/* Laisser un mot au médecin. Toujours présent : c'est le
                  bouton qui permet d'ENTAMER un fil, là où la mention près du
                  nom n'existe qu'une fois un mot écrit. */}
              <button
                onClick={() => { setMotFor(a); setMotTexte(''); setMotErreur('') }}
                title="Laisser un mot au médecin"
                className="flex items-center gap-1 text-xs text-violet-700 border border-violet-200 rounded-lg px-2 py-1 hover:bg-violet-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>

              {/* Déplacer */}
              {permissions.manage_appointments && a.amount_paid == null && (
                <button
                  onClick={() => { setMoveError(''); setMoveFor(a); setMoveDate(''); setMoveTime('') }}
                  className="flex items-center gap-1 text-xs text-primary-600 border border-primary-200 rounded-lg px-2 py-1 hover:bg-primary-50"
                >
                  <CalendarClock className="h-3.5 w-3.5" /> Déplacer
                </button>
              )}

              {/* Annulation */}
              {permissions.manage_appointments && a.amount_paid == null && (
                <button
                  onClick={() => { if (confirm('Annuler ce rendez-vous ?')) patchRdv(a.id, { status: 'cancelled' }) }}
                  className="text-xs text-gray-400 hover:text-red-500 px-1"
                >
                  Annuler
                </button>
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
      <Dialog open={!!payFor} onOpenChange={(o) => { if (!o) { setPayFor(null); setPayError('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Encaisser — {payFor?.patient ? `${payFor.patient.first_name} ${payFor.patient.last_name}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pay_due">Total dû (DH)</Label>
                <Input id="pay_due" type="number" inputMode="decimal" min="0" step="any" value={payDue}
                  onChange={(e) => { setPayDue(e.target.value); setPayError('') }} placeholder="0"
                  disabled={!permissions.edit_prices}
                  className={!permissions.edit_prices ? 'bg-gray-50 text-gray-500' : ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay_amount">Encaissé (DH)</Label>
                <Input id="pay_amount" type="number" inputMode="decimal" min="0" step="any" autoFocus value={payAmount} onChange={(e) => { setPayAmount(e.target.value); setPayError('') }} placeholder="0" />
              </div>
            </div>

            {/* Reste à payer + bouton Solder le reste */}
            {(() => {
              const due = parseFloat(payDue.replace(',', '.'))
              const paid = parseFloat(payAmount.replace(',', '.'))
              const reste = Math.round((due - paid) * 100) / 100
              if (!isNaN(due) && !isNaN(paid) && reste > 0) {
                return (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-orange-600 font-medium">Reste à payer : {reste} DH</p>
                    <button type="button" onClick={() => { setPayAmount(payDue); setPayError('') }}
                      className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 hover:bg-green-100 transition-colors">
                      Solder le reste
                    </button>
                  </div>
                )
              }
              if (!isNaN(due) && !isNaN(paid) && due > 0 && paid >= due) return <p className="text-xs text-green-600 font-medium">Soldé ✓</p>
              return null
            })()}

            <div className="space-y-1.5">
              <Label>Mode de règlement</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {payError && <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{payError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => { setPayFor(null); setPayError('') }}>Annuler</Button>
            <Button type="button" onClick={savePayment}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            amount_paid: a.amount_paid ?? null,
            payment_method: a.payment_method ?? null,
          }))}
          blocks={blocks}
          showPhone={permissions.patients_contact}
          showMoney={permissions.payments}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* Fil avec le médecin, au sujet d'un rendez-vous */}
      <Dialog open={!!motFor} onOpenChange={(o) => { if (!o) { setMotFor(null); setMotErreur('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-violet-600" />
              Mot au médecin — {motFor?.patient ? `${motFor.patient.first_name} ${motFor.patient.last_name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {Array.isArray(motFor?.mots) && motFor!.mots.length > 0 && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {motFor!.mots.map((m: Apt) => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm ${m.auteur === 'medecin' ? 'bg-primary-50 border border-primary-100' : 'bg-gray-50 border border-gray-100'}`}
                  >
                    <p className="text-[11px] text-gray-500 mb-0.5">
                      {m.auteur === 'medecin' ? doctorName : (m.auteur_nom || 'Accueil')} · {formatTime(String(m.created_at).slice(11, 16))}
                    </p>
                    <p className="text-gray-800 whitespace-pre-wrap">{m.contenu}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Pas de notification à inventer : l'écran du médecin se
                rafraîchit déjà tout seul. On le dit, pour qu'elle sache si
                elle doit aller frapper à la porte. */}
            <p className="text-[11px] text-gray-400">
              Le médecin le verra sur son agenda et dans la consultation du patient. Ce n&apos;est pas une alerte : pour une urgence, allez le voir.
            </p>

            <textarea
              value={motTexte}
              onChange={(e) => setMotTexte(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Elle demande si elle peut décaler à jeudi…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            {motErreur && <p role="alert" className="text-xs text-red-600">{motErreur}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMotFor(null); setMotErreur('') }} className="flex-1">Fermer</Button>
              <Button onClick={envoyerMot} disabled={motEnCours || !motTexte.trim()} className="flex-1">
                {motEnCours ? 'Envoi…' : 'Envoyer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
