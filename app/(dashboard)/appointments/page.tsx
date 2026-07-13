'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppointmentList, type PaymentPayload } from '@/components/dashboard/AppointmentList'
import { AddAppointmentDialog } from '@/components/dashboard/AddAppointmentDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { Appointment, Doctor, AppointmentStatus, AppointmentAttendance } from '@/types'
import { Plus, Search, Calendar, Ban, X, FileText } from 'lucide-react'
import DaySheet from '@/components/shared/DaySheet'
import {
  format, startOfWeek, endOfWeek, addDays, subDays,
  startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth, isSameDay, getDay,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { getNowInMaroc } from '@/lib/utils'

type ViewMode = 'day' | 'week' | 'month' | 'all'

export default function AppointmentsPage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [currentDate, setCurrentDate] = useState(getNowInMaroc())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  // Blocage de créneau
  type Block = { id: string; date: string; start_time: string | null; end_time: string | null; reason: string | null }
  const [dayBlocks, setDayBlocks] = useState<Block[]>([])
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockStart, setBlockStart] = useState('13:00')
  const [blockEnd, setBlockEnd] = useState('14:00')
  const [blockReason, setBlockReason] = useState('')
  const [blockFullDay, setBlockFullDay] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState('')

  const supabase = createClient()

  // Charge le médecin connecté
  useEffect(() => {
    async function loadDoctor() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('doctors')
        .select('*')
        .eq('email', user.email)
        .single()
      setDoctor(data)
    }
    loadDoctor()
  }, [])

  // Charge les rendez-vous selon la vue
  const loadAppointments = useCallback(async () => {
    if (!doctor) return
    setLoading(true)

    try {
      let query = supabase
        .from('appointments')
        .select('*, patient:patients(*), consultation_type:consultation_types(*)')
        .eq('doctor_id', doctor.id)
        .order('date', { ascending: true })
        .order('time', { ascending: true })

      if (viewMode === 'day') {
        const dateStr = format(currentDate, 'yyyy-MM-dd')
        query = query.eq('date', dateStr)
      } else if (viewMode === 'week') {
        const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        const weekEnd = format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        query = query.gte('date', weekStart).lte('date', weekEnd)
      } else if (viewMode === 'month') {
        const mStart = format(startOfMonth(currentDate), 'yyyy-MM-dd')
        const mEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd')
        query = query.gte('date', mStart).lte('date', mEnd)
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data } = await query
      let list = data ?? []

      // RDV clôturés (parti) : charge note + ordonnances + certificats (résumé)
      const doneIds = list.filter((a: Appointment) => a.queue_status === 'parti').map((a: Appointment) => a.id)
      if (doneIds.length > 0) {
        const [notesRes, presRes, certsRes] = await Promise.all([
          supabase.from('consultation_notes').select('appointment_id, note').in('appointment_id', doneIds),
          supabase.from('prescriptions').select('id, appointment_id, content').in('appointment_id', doneIds),
          supabase.from('certificates').select('id, appointment_id, title, motif').in('appointment_id', doneIds),
        ])
        const noteBy = new Map<string, string>()
        for (const n of notesRes.data ?? []) if (n.appointment_id) noteBy.set(n.appointment_id, n.note)
        const presBy = new Map<string, { id: string; content: string }[]>()
        for (const p of presRes.data ?? []) {
          if (!p.appointment_id) continue
          const arr = presBy.get(p.appointment_id) ?? []; arr.push({ id: p.id, content: p.content }); presBy.set(p.appointment_id, arr)
        }
        const certBy = new Map<string, { id: string; title: string; motif: string | null }[]>()
        for (const c of certsRes.data ?? []) {
          if (!c.appointment_id) continue
          const arr = certBy.get(c.appointment_id) ?? []; arr.push({ id: c.id, title: c.title, motif: c.motif }); certBy.set(c.appointment_id, arr)
        }
        list = list.map((a: Appointment) => (a.queue_status === 'parti' ? {
          ...a,
          consultation_summary: noteBy.get(a.id) ?? null,
          consultation_prescriptions: presBy.get(a.id) ?? [],
          consultation_certificates: certBy.get(a.id) ?? [],
        } : a))
      }

      setAppointments(list)
    } finally {
      setLoading(false)
    }
  }, [doctor, viewMode, currentDate, statusFilter])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Blocages du jour affiché (vue Jour)
  const loadDayBlocks = useCallback(async () => {
    if (!doctor || viewMode !== 'day') { setDayBlocks([]); return }
    const dStr = format(currentDate, 'yyyy-MM-dd')
    const { data } = await supabase.from('blocked_dates')
      .select('id, date, start_time, end_time, reason')
      .eq('doctor_id', doctor.id).eq('date', dStr).order('start_time', { ascending: true })
    setDayBlocks((data ?? []) as Block[])
  }, [doctor, viewMode, currentDate, supabase])

  useEffect(() => { loadDayBlocks() }, [loadDayBlocks])

  async function addBlock() {
    if (!doctor) return
    if (!blockFullDay && (!blockStart || !blockEnd || blockEnd <= blockStart)) {
      setBlockError('L\'heure de fin doit être après l\'heure de début.'); return
    }
    setBlocking(true); setBlockError('')
    const { error } = await supabase.from('blocked_dates').insert({
      doctor_id: doctor.id,
      date: format(currentDate, 'yyyy-MM-dd'),
      start_time: blockFullDay ? null : blockStart,
      end_time: blockFullDay ? null : blockEnd,
      reason: blockReason.trim() || null,
    })
    setBlocking(false)
    if (error) { setBlockError('Échec du blocage. Réessayez.'); return }
    setBlockOpen(false); setBlockReason('')
    await loadDayBlocks()
    await loadAppointments()
  }

  async function removeBlock(id: string) {
    await supabase.from('blocked_dates').delete().eq('id', id)
    await loadDayBlocks()
  }

  // Filtre par recherche côté client
  const filtered = appointments.filter((apt) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const patient = apt.patient
    if (!patient) return false
    return (
      patient.first_name.toLowerCase().includes(q) ||
      patient.last_name.toLowerCase().includes(q) ||
      patient.phone.includes(q)
    )
  })

  async function handleStatusChange(id: string, status: AppointmentStatus) {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await loadAppointments()
  }

  // Déplace un RDV vers une nouvelle date/heure. Lance en cas de collision (409).
  async function handleReschedule(id: string, date: string, time: string) {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error || 'Échec du déplacement du rendez-vous.')
    }
    await loadAppointments()
  }

  async function handleAttendanceChange(id: string, attendance: AppointmentAttendance) {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendance }),
    })
    // Mise à jour optimiste locale
    setAppointments((prev) =>
      prev.map((a) => a.id === id ? { ...a, attendance } : a)
    )
  }

  // Enregistre l'encaissement (montant payé, total dû, mode de règlement).
  // null = annuler le paiement. On attend la confirmation serveur avant l'UI.
  async function handlePayment(id: string, payload: PaymentPayload) {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Échec de l\'enregistrement du paiement')
    }
    const updated = await res.json().catch(() => null)
    setAppointments((prev) =>
      prev.map((a) => a.id === id
        ? {
            ...a,
            amount_paid: payload.amount_paid,
            amount_due: payload.amount_due,
            payment_method: payload.payment_method,
            paid_at: updated?.paid_at ?? (payload.amount_paid !== null ? new Date().toISOString() : null),
          }
        : a)
    )
  }

  // Navigation dates
  function navigate(direction: 'prev' | 'next') {
    if (viewMode === 'day') {
      setCurrentDate(direction === 'next' ? addDays(currentDate, 1) : subDays(currentDate, 1))
    } else if (viewMode === 'month') {
      setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    } else {
      setCurrentDate(direction === 'next' ? addDays(currentDate, 7) : subDays(currentDate, 7))
    }
  }

  const dateLabel = viewMode === 'day'
    ? format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })
    : viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: fr })
    : `Semaine du ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM', { locale: fr })} au ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: fr })}`

  // Construit la grille du mois (lundi → dimanche) pour la vue calendrier
  function buildMonthGrid(): Date[] {
    const first = startOfMonth(currentDate)
    const offset = (getDay(first) + 6) % 7 // lundi = 0
    const gridStart = subDays(first, offset)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }
  // Compte des RDV (non annulés) par jour pour la vue mois
  const countByDay = new Map<string, number>()
  if (viewMode === 'month') {
    for (const a of filtered) {
      if (a.status === 'cancelled') continue
      countByDay.set(a.date, (countByDay.get(a.date) ?? 0) + 1)
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rendez-vous</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} RDV affichés</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setSheetOpen(true)} disabled={!doctor}>
            <FileText className="h-4 w-4 mr-2" /> Feuille de route
          </Button>
          <Button variant="outline" onClick={() => { setBlockError(''); setBlockOpen(true) }} disabled={!doctor}>
            <Ban className="h-4 w-4 mr-2" /> Bloquer un créneau
          </Button>
          <Button onClick={() => setAddOpen(true)} disabled={!doctor}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau RDV
          </Button>
        </div>
      </div>

      {/* Créneaux bloqués du jour (vue Jour) */}
      {viewMode === 'day' && dayBlocks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dayBlocks.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-100 rounded-full pl-3 pr-1.5 py-1">
              <Ban className="h-3 w-3" />
              {b.start_time ? `${b.start_time.slice(0, 5)}–${(b.end_time ?? '').slice(0, 5)}` : 'Journée bloquée'}{b.reason ? ` · ${b.reason}` : ''}
              <button onClick={() => removeBlock(b.id)} className="rounded-full hover:bg-red-200 p-0.5" aria-label="Débloquer"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Vue et navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border overflow-hidden">
              {(['day', 'week', 'month', 'all'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode === 'day' ? 'Jour' : mode === 'week' ? 'Semaine' : mode === 'month' ? 'Mois' : 'Tous'}
                </button>
              ))}
            </div>

            {viewMode !== 'all' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => navigate('prev')}>←</Button>
                <Button variant="outline" size="sm" onClick={() => navigate('next')}>→</Button>
                <span className="text-sm font-medium text-gray-700 capitalize text-center flex-1 min-w-0 truncate">
                  {dateLabel}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentDate(getNowInMaroc())}
                  className="text-primary-500 shrink-0"
                >
                  Aujourd&apos;hui
                </Button>
              </div>
            )}
          </div>

          {/* Recherche + filtre statut */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un patient…"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as AppointmentStatus | 'all')}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rendez-vous</SelectItem>
                <SelectItem value="pending">À confirmer</SelectItem>
                <SelectItem value="confirmed">Confirmés</SelectItem>
                <SelectItem value="cancelled">Annulés</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary-500" />
            {loading ? 'Chargement…' : `${filtered.length} rendez-vous`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : viewMode === 'month' ? (
            /* Grille calendrier mensuelle */
            <div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {buildMonthGrid().map((day) => {
                  const dStr = format(day, 'yyyy-MM-dd')
                  const count = countByDay.get(dStr) ?? 0
                  const inMonth = isSameMonth(day, currentDate)
                  const isToday = isSameDay(day, getNowInMaroc())
                  return (
                    <button
                      key={dStr}
                      onClick={() => { setCurrentDate(day); setViewMode('day') }}
                      className={`aspect-square rounded-lg border p-1.5 flex flex-col items-start transition-colors ${
                        inMonth ? 'bg-white hover:border-primary-300' : 'bg-gray-50 text-gray-300'
                      } ${isToday ? 'border-primary-500 border-2' : 'border-gray-100'}`}
                    >
                      <span className={`text-xs font-medium ${isToday ? 'text-primary-600' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                        {format(day, 'd')}
                      </span>
                      {count > 0 && inMonth && (
                        <span className="mt-auto self-stretch text-[10px] font-semibold text-primary-700 bg-primary-50 rounded px-1 py-0.5 text-center">
                          {count} RDV
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">Cliquez sur un jour pour voir le détail</p>
            </div>
          ) : (
            <AppointmentList
              appointments={filtered}
              onStatusChange={handleStatusChange}
              onAttendanceChange={handleAttendanceChange}
              onPayment={handlePayment}
              onViewPatient={(patientId) => router.push(`/patients?patient=${patientId}`)}
              onReschedule={handleReschedule}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialog ajout */}
      {doctor && (
        <AddAppointmentDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          doctor={doctor}
          onSuccess={loadAppointments}
        />
      )}

      {sheetOpen && doctor && (
        <DaySheet
          doctorName={doctor.name}
          date={format(currentDate, 'yyyy-MM-dd')}
          items={appointments
            .filter((a) => a.date === format(currentDate, 'yyyy-MM-dd') && a.status !== 'cancelled')
            .map((a) => ({
              id: a.id,
              time: a.time,
              name: a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient',
              motif: a.consultation_type?.name || a.notes || null,
              phone: a.patient?.phone ?? null,
              attendance: a.attendance ?? null,
              amount_paid: a.amount_paid ?? null,
              payment_method: a.payment_method ?? null,
            }))}
          blocks={dayBlocks}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* Dialog : bloquer un créneau */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Bloquer un créneau — {format(currentDate, 'EEEE d MMMM', { locale: fr })}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Le créneau bloqué devient indisponible pour les patients (en ligne) et pour votre secrétaire.</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={blockFullDay} onChange={(e) => setBlockFullDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-500" />
              Bloquer toute la journée
            </label>
            {!blockFullDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>De</Label>
                  <Input type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>À</Label>
                  <Input type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Motif (optionnel)</Label>
              <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ex : urgence, visite extérieure, pause…" />
            </div>
            {blockError && <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{blockError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Annuler</Button>
            <Button onClick={addBlock} disabled={blocking}>{blocking ? 'Blocage…' : 'Bloquer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
