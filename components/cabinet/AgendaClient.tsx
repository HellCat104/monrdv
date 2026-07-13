'use client'

// Agenda interactif de la secrétaire : liste du jour, création de RDV,
// pointage des présences, encaissement et annulation — selon ses permissions.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getNowInMaroc, formatTime } from '@/lib/utils'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Plus, Check, X, Clock, Banknote, ChevronLeft, ChevronRight, CalendarClock, Ban } from 'lucide-react'
import { ATTENDANCE_LABELS, ATTENDANCE_COLORS, PAYMENT_METHOD_LABELS, type StaffPermissions } from '@/types'
import DaySheet from '@/components/shared/DaySheet'
import { FileText } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>
interface CType { id: string; name: string; duration_minutes: number | null; default_price: number | null }
const NO_TYPE = '__none__'

export default function AgendaClient({ permissions, doctorName = 'Cabinet médical' }: { permissions: StaffPermissions; doctorName?: string }) {
  const [date, setDate] = useState(() => format(getNowInMaroc(), 'yyyy-MM-dd'))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')
  const [weekAppts, setWeekAppts] = useState<Apt[]>([])
  const [weekLoading, setWeekLoading] = useState(false)
  const [appts, setAppts] = useState<Apt[]>([])
  const [types, setTypes] = useState<CType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Dialog nouveau RDV
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', time: '', notes: '' })
  const [typeId, setTypeId] = useState(NO_TYPE)
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [doctorId, setDoctorId] = useState('')

  // Encaissement inline
  const [payFor, setPayFor] = useState<Apt | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('especes')

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

  const load = useCallback(async (d: string) => {
    setLoading(true)
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
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])

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
    setSaving(true)
    try {
      const res = await fetch('/api/cabinet/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          date,
          consultation_type_id: typeId !== NO_TYPE ? typeId : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAddError(data.error || 'Erreur lors de la création'); return }
      setAddOpen(false)
      setForm({ first_name: '', last_name: '', phone: '', time: '', notes: '' })
      setTypeId(NO_TYPE)
      await load(date)
    } catch {
      setAddError('Erreur réseau')
    } finally {
      setSaving(false)
    }
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

  async function savePayment() {
    if (!payFor) return
    const amount = Number(payAmount)
    if (!Number.isFinite(amount) || amount < 0) { alert('Montant invalide'); return }
    const type = types.find((t) => t.id === payFor.consultation_type_id)
    const due = type?.default_price ?? null
    const ok = await patchRdv(payFor.id, { amount_paid: amount, amount_due: due != null && due > amount ? due : null, payment_method: payMethod })
    if (ok) { setPayFor(null); setPayAmount('') }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary-500" /> Agenda
        </h1>
        {permissions.manage_appointments && (
          <div className="flex items-center gap-2 flex-wrap">
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
                <p className="font-medium text-gray-900 truncate">
                  {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}
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

              {/* Paiement */}
              {permissions.payments && (
                a.amount_paid != null ? (
                  <span className="text-xs text-gray-600 whitespace-nowrap">
                    {a.amount_paid} DH{a.payment_method ? ` · ${PAYMENT_METHOD_LABELS[a.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? a.payment_method}` : ''}
                  </span>
                ) : (
                  <button
                    onClick={() => { setPayFor(a); setPayAmount(String(types.find((t) => t.id === a.consultation_type_id)?.default_price ?? '')) }}
                    className="flex items-center gap-1 text-xs text-primary-600 border border-primary-200 rounded-lg px-2 py-1 hover:bg-primary-50"
                  >
                    <Banknote className="h-3.5 w-3.5" /> Encaisser
                  </button>
                )
              )}

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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c_first">Prénom *</Label>
                <Input id="c_first" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Mohammed" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c_last">Nom *</Label>
                <Input id="c_last" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Alami" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c_phone">Téléphone *</Label>
              <Input id="c_phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="06 12 34 56 78" required />
            </div>
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

      {/* Dialog encaissement */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Encaisser — {payFor?.patient ? `${payFor.patient.first_name} ${payFor.patient.last_name}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay_amount">Montant payé (DH)</Label>
              <Input id="pay_amount" type="number" min="0" step="1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mode de règlement</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setPayFor(null)}>Annuler</Button>
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
    </div>
  )
}
