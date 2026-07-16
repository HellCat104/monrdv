'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDateShort, formatTime, getInitials } from '@/lib/utils'
import { STATUS_LABELS, STATUS_COLORS, ATTENDANCE_LABELS, ATTENDANCE_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import type { Appointment, AppointmentStatus, AppointmentAttendance, PaymentMethod } from '@/types'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Phone, Clock, UserX, Timer, User, DoorOpen, Wallet, Printer, ClipboardList, FileText, Undo2, MoreHorizontal, Play, RotateCcw, XCircle, Check, Pill, CalendarClock } from 'lucide-react'

// Élément du menu « ⋯ » d'une carte RDV
export interface MoreMenuItem {
  label: string
  icon: typeof MoreHorizontal
  href?: string
  onClick?: () => void
  danger?: boolean
}

// Petit menu déroulant maison (pas de dépendance) pour les actions occasionnelles
function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Plus d'actions"
        className="flex items-center justify-center h-6 w-7 rounded-full border border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          {/* clic à l'extérieur = fermer */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-50 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
            {items.map(({ label, icon: Icon, href, onClick, danger }) => (
              href ? (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Icon className="h-3.5 w-3.5 text-gray-400" /> {label}
                </a>
              ) : (
                <button
                  key={label}
                  onClick={() => { setOpen(false); onClick?.() }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 ${danger ? 'text-red-600' : 'text-gray-600'}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${danger ? 'text-red-400' : 'text-gray-400'}`} /> {label}
                </button>
              )
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export interface PaymentPayload {
  amount_paid: number | null
  amount_due: number | null
  payment_method: PaymentMethod | null
}

interface AppointmentListProps {
  appointments: Appointment[]
  onStatusChange?: (id: string, status: AppointmentStatus) => Promise<void>
  onAttendanceChange?: (id: string, attendance: AppointmentAttendance) => Promise<void>
  onPayment?: (id: string, payload: PaymentPayload) => Promise<void>
  onViewPatient?: (patientId: string) => void
  onReschedule?: (id: string, date: string, time: string) => Promise<void>
}

export function AppointmentList({ appointments, onStatusChange, onAttendanceChange, onPayment, onViewPatient, onReschedule }: AppointmentListProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; id: string; action: 'confirmed' | 'cancelled'; label: string
  }>({ open: false, id: '', action: 'confirmed', label: '' })
  const [loading, setLoading] = useState(false)
  // Dialog d'encaissement (paiements partiels + mode de règlement)
  const [payDialog, setPayDialog] = useState<{
    open: boolean; id: string; due: string; paid: string; method: PaymentMethod | ''
  }>({ open: false, id: '', due: '', paid: '', method: '' })
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  // Dialog de déplacement (reprogrammation) d'un RDV
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; apt: Appointment | null; date: string; time: string }>({ open: false, apt: null, date: '', time: '' })
  const [moveSlots, setMoveSlots] = useState<{ time: string; available: boolean }[]>([])
  const [moveLoadingSlots, setMoveLoadingSlots] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState('')

  // Charge les créneaux dispo quand on choisit une date dans le dialog « Déplacer »
  useEffect(() => {
    if (!moveDialog.open || !moveDialog.apt || !moveDialog.date) { setMoveSlots([]); return }
    setMoveLoadingSlots(true)
    const typeParam = moveDialog.apt.consultation_type_id ? `&type=${moveDialog.apt.consultation_type_id}` : ''
    fetch(`/api/slots?doctor_id=${moveDialog.apt.doctor_id}&date=${moveDialog.date}${typeParam}`)
      .then((r) => r.json())
      .then((d) => setMoveSlots(d.slots ?? []))
      .finally(() => setMoveLoadingSlots(false))
  }, [moveDialog.open, moveDialog.apt, moveDialog.date])

  async function confirmMove() {
    if (!moveDialog.apt || !moveDialog.date || !moveDialog.time || !onReschedule) return
    setMoving(true); setMoveError('')
    try {
      await onReschedule(moveDialog.apt.id, moveDialog.date, moveDialog.time)
      setMoveDialog({ open: false, apt: null, date: '', time: '' })
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : 'Échec du déplacement.')
    } finally {
      setMoving(false)
    }
  }
  // Dialog d'émission d'avoir (annulation/correction de facture)
  const [creditDialog, setCreditDialog] = useState<{
    open: boolean; id: string; invoiceNo: string; amount: string; reason: string
  }>({ open: false, id: '', invoiceNo: '', amount: '', reason: '' })
  const [crediting, setCrediting] = useState(false)
  const [creditError, setCreditError] = useState('')
  const [creditDone, setCreditDone] = useState<{ creditNo: string; id: string } | null>(null)

  async function submitCreditNote() {
    setCrediting(true)
    setCreditError('')
    try {
      const res = await fetch(`/api/appointments/${creditDialog.id}/credit-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: creditDialog.amount ? Number(creditDialog.amount) : undefined,
          reason: creditDialog.reason || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Échec de l\'émission de l\'avoir')
      setCreditDone({ creditNo: data.credit_no, id: data.id })
    } catch (e) {
      setCreditError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setCrediting(false)
    }
  }

  async function handleAction() {
    setLoading(true)
    try {
      await onStatusChange?.(confirmDialog.id, confirmDialog.action)
    } finally {
      setLoading(false)
      setConfirmDialog((prev) => ({ ...prev, open: false }))
    }
  }

  async function handleAttendance(id: string, attendance: AppointmentAttendance) {
    await onAttendanceChange?.(id, attendance)
  }

  // Ouvre le dialog en pré-remplissant depuis le RDV (et le tarif du motif)
  function openPayDialog(apt: Appointment) {
    const due = apt.amount_due ?? apt.consultation_type?.default_price ?? null
    setPayError('')
    setPayDialog({
      open: true,
      id: apt.id,
      due: due != null ? String(due) : '',
      paid: apt.amount_paid != null ? String(apt.amount_paid) : '',
      method: apt.payment_method ?? '',
    })
  }

  async function handleConfirmPayment() {
    const paid = parseFloat(payDialog.paid.replace(',', '.'))
    if (isNaN(paid) || paid < 0) {
      setPayError('Veuillez saisir un montant encaissé valide.')
      return
    }
    const dueRaw = payDialog.due.trim()
    const due = dueRaw === '' ? null : parseFloat(dueRaw.replace(',', '.'))
    if (due !== null && (isNaN(due) || due < 0)) {
      setPayError('Montant total invalide.')
      return
    }
    setPayError('')
    setPaying(true)
    try {
      await onPayment?.(payDialog.id, {
        amount_paid: paid,
        amount_due: due,
        payment_method: payDialog.method || null,
      })
      setPayDialog({ open: false, id: '', due: '', paid: '', method: '' })
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setPaying(false)
    }
  }

  // Statut de paiement dérivé
  function paymentStatus(apt: Appointment): 'paid' | 'partial' | 'unpaid' | null {
    if (apt.amount_paid == null) return null
    const due = apt.amount_due ?? 0
    if (due > 0 && apt.amount_paid < due) return 'partial'
    return 'paid'
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Aucun rendez-vous</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {appointments.map((apt) => apt.queue_status === 'parti' ? (
          /* ── RDV clôturé : carte repliée + résumé de consultation ── */
          <div key={apt.id} className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/60">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-semibold text-xs shrink-0">
                {apt.patient ? getInitials(apt.patient.first_name, apt.patient.last_name) : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">
                    {apt.patient ? `${apt.patient.first_name} ${apt.patient.last_name}` : 'Patient'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600">
                    <Check className="h-3 w-3" /> Consultation terminée
                  </span>
                  {apt.amount_paid != null && (
                    <span className="text-xs text-green-600 font-medium">{apt.amount_paid} DH{apt.payment_method ? ` · ${PAYMENT_METHOD_LABELS[apt.payment_method]}` : ''}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatDateShort(apt.date)} à {formatTime(apt.time)}
                </p>

                <details className="mt-2 group">
                  <summary className="text-xs font-medium text-primary-600 cursor-pointer select-none list-none flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Résumé de la consultation
                  </summary>
                  <div className="mt-1.5 bg-white border border-gray-100 rounded-lg p-2.5 space-y-2">
                    {/* Note */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Note</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">
                        {apt.consultation_summary?.trim() ? apt.consultation_summary : <span className="text-gray-400 italic">Aucune note.</span>}
                      </p>
                    </div>

                    {/* Ordonnances */}
                    {(apt.consultation_prescriptions?.length ?? 0) > 0 && (
                      <div className="border-t border-gray-50 pt-1.5">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1"><Pill className="h-3 w-3" /> Ordonnances</p>
                        {apt.consultation_prescriptions!.map((p) => (
                          <a key={p.id} href={`/ordonnance/p/${p.id}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-gray-600 hover:text-primary-600 truncate">• {p.content.replace(/\n/g, ' · ')}</a>
                        ))}
                      </div>
                    )}

                    {/* Certificats */}
                    {(apt.consultation_certificates?.length ?? 0) > 0 && (
                      <div className="border-t border-gray-50 pt-1.5">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1"><FileText className="h-3 w-3" /> Certificats</p>
                        {apt.consultation_certificates!.map((c) => (
                          <a key={c.id} href={`/certificat/${c.id}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-gray-600 hover:text-primary-600 truncate">• {c.title}{c.motif ? ` (${c.motif})` : ''}</a>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>

              <div className="shrink-0">
                <MoreMenu
                  items={[
                    apt.patient_id ? { label: 'Reprendre la consultation', icon: Play, href: `/consultation/${apt.id}` } : null,
                    apt.patient_id ? { label: 'Ordonnance', icon: FileText, href: `/ordonnance/${apt.id}` } : null,
                    apt.amount_paid != null ? { label: 'Facture', icon: Printer, href: `/facture/${apt.id}` } : null,
                    apt.invoice_no ? {
                      label: 'Émettre un avoir', icon: Undo2,
                      onClick: () => {
                        setCreditDone(null); setCreditError('')
                        setCreditDialog({ open: true, id: apt.id, invoiceNo: apt.invoice_no!, amount: apt.amount_paid != null ? String(apt.amount_paid) : '', reason: '' })
                      },
                    } : null,
                    onViewPatient && apt.patient_id ? { label: 'Voir la fiche patient', icon: User, onClick: () => onViewPatient(apt.patient_id) } : null,
                  ].filter(Boolean) as MoreMenuItem[]}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            key={apt.id}
            className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:border-primary-200 hover:shadow-sm transition-all"
          >
            {/* Avatar initiales */}
            <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold text-sm shrink-0">
              {apt.patient ? getInitials(apt.patient.first_name, apt.patient.last_name) : '?'}
            </div>

            {/* Infos patient */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 text-sm">
                  {apt.patient ? `${apt.patient.first_name} ${apt.patient.last_name}` : 'Patient inconnu'}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[apt.status]}`}>
                  {STATUS_LABELS[apt.status]}
                </span>
                {apt.attendance && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ATTENDANCE_COLORS[apt.attendance]}`}>
                    {ATTENDANCE_LABELS[apt.attendance]}
                  </span>
                )}
                {apt.specialty && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {apt.specialty}
                  </span>
                )}
                {apt.walk_in && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                    Sans RDV
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDateShort(apt.date)} à {formatTime(apt.time)}
                  {apt.duration_minutes ? ` (${apt.duration_minutes} min)` : ''}
                </span>
                {apt.patient && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {apt.patient.phone}
                  </span>
                )}
                {(apt.consultation_type?.name || apt.notes) && (
                  <span className="flex items-center gap-1">
                    <ClipboardList className="h-3 w-3" />
                    {apt.consultation_type?.name || apt.notes}
                  </span>
                )}
                {apt.amount_paid != null && (() => {
                  const st = paymentStatus(apt)
                  const reste = (apt.amount_due ?? 0) - apt.amount_paid
                  return (
                    <span className={`flex items-center gap-1 font-medium ${st === 'partial' ? 'text-orange-600' : 'text-green-600'}`}>
                      <Wallet className="h-3 w-3" />
                      {st === 'partial'
                        ? `${apt.amount_paid}/${apt.amount_due} DH · reste ${reste} DH`
                        : `${apt.amount_paid} DH payés`}
                      {apt.payment_method ? ` · ${PAYMENT_METHOD_LABELS[apt.payment_method]}` : ''}
                    </span>
                  )
                })()}
              </div>

              {/* Actions du jour — un bouton principal selon l'étape + menu ⋯ */}
              {apt.status === 'confirmed' && (
                <div className="flex gap-1.5 mt-2 flex-wrap max-w-full items-center">
                  {/* Action principale : ouvrir la consultation (marque le patient
                      présent au passage s'il ne l'était pas encore) */}
                  {apt.patient_id && (
                    <a
                      href={`/consultation/${apt.id}`}
                      onClick={() => { if (apt.attendance !== 'present') onAttendanceChange?.(apt.id, 'present') }}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary-500 text-white hover:bg-primary-600 transition-colors font-medium"
                    >
                      <Play className="h-3 w-3" /> Consultation
                    </a>
                  )}

                  {/* Encaissement : bouton tant que non payé, badge-état ensuite */}
                  {onPayment && (
                    apt.amount_paid == null ? (
                      <button
                        onClick={() => openPayDialog(apt)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600 transition-colors font-medium"
                      >
                        <Wallet className="h-3 w-3" /> Encaisser
                      </button>
                    ) : (
                      <button
                        onClick={() => openPayDialog(apt)}
                        title="Modifier l'encaissement"
                        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                          paymentStatus(apt) === 'partial'
                            ? 'bg-orange-100 text-orange-700 border-orange-200'
                            : 'bg-green-100 text-green-700 border-green-200'
                        }`}
                      >
                        <Wallet className="h-3 w-3" />
                        {paymentStatus(apt) === 'partial' ? `${apt.amount_paid}/${apt.amount_due} DH` : `✓ ${apt.amount_paid} DH`}
                      </button>
                    )
                  )}

                  {/* Menu ⋯ : actions occasionnelles */}
                  <MoreMenu
                    items={[
                      onReschedule ? { label: 'Déplacer le RDV', icon: CalendarClock, onClick: () => { setMoveError(''); setMoveDialog({ open: true, apt, date: '', time: '' }) } } : null,
                      apt.patient_id ? { label: 'Ordonnance', icon: FileText, href: `/ordonnance/${apt.id}` } : null,
                      apt.amount_paid != null ? { label: 'Facture', icon: Printer, href: `/facture/${apt.id}` } : null,
                      apt.invoice_no ? {
                        label: 'Émettre un avoir', icon: Undo2,
                        onClick: () => {
                          setCreditDone(null); setCreditError('')
                          setCreditDialog({
                            open: true, id: apt.id, invoiceNo: apt.invoice_no!,
                            amount: apt.amount_paid != null ? String(apt.amount_paid) : '',
                            reason: '',
                          })
                        },
                      } : null,
                      onAttendanceChange && apt.attendance !== 'present' ? {
                        label: 'Patient arrivé', icon: DoorOpen,
                        onClick: () => handleAttendance(apt.id, 'present'),
                      } : null,
                      onAttendanceChange ? {
                        label: apt.attendance === 'late' ? 'Retirer « en retard »' : 'Marquer en retard', icon: Timer,
                        onClick: () => handleAttendance(apt.id, apt.attendance === 'late' ? null : 'late'),
                      } : null,
                      onAttendanceChange ? {
                        label: apt.attendance === 'absent' ? 'Retirer « absent »' : 'Marquer absent', icon: UserX,
                        onClick: () => handleAttendance(apt.id, apt.attendance === 'absent' ? null : 'absent'),
                      } : null,
                      onAttendanceChange && apt.attendance ? {
                        label: 'Réinitialiser la présence', icon: RotateCcw,
                        onClick: () => handleAttendance(apt.id, null),
                      } : null,
                      onStatusChange ? {
                        label: 'Annuler le RDV', icon: XCircle, danger: true,
                        onClick: () => setConfirmDialog({ open: true, id: apt.id, action: 'cancelled', label: 'annuler' }),
                      } : null,
                    ].filter(Boolean) as MoreMenuItem[]}
                  />
                </div>
              )}
            </div>

            {/* Actions droite */}
            <div className="flex flex-col gap-1.5 shrink-0 items-end">
              {/* Confirmer / Annuler — seulement pour les RDV en attente
                  (pour les confirmés, « Annuler le RDV » est dans le menu ⋯) */}
              {apt.status === 'pending' && onStatusChange && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-200 hover:bg-green-50 h-8 px-2 text-xs"
                    onClick={() => setConfirmDialog({ open: true, id: apt.id, action: 'confirmed', label: 'confirmer' })}
                  >
                    Confirmer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 border-red-200 hover:bg-red-50 h-8 px-2 text-xs"
                    onClick={() => setConfirmDialog({ open: true, id: apt.id, action: 'cancelled', label: 'annuler' })}
                  >
                    Annuler
                  </Button>
                </div>
              )}
              {/* Voir la fiche patient */}
              {onViewPatient && apt.patient_id && (
                <button
                  onClick={() => onViewPatient(apt.patient_id)}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline mt-0.5"
                >
                  <User className="h-3 w-3" /> Voir la fiche patient
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* fin liste */}

      {/* Dialog : déplacer un RDV */}
      <Dialog open={moveDialog.open} onOpenChange={(o) => { if (!o) setMoveDialog({ open: false, apt: null, date: '', time: '' }) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Déplacer le rendez-vous</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              {moveDialog.apt?.patient ? `${moveDialog.apt.patient.first_name} ${moveDialog.apt.patient.last_name}` : 'Patient'}
              {moveDialog.apt ? ` — actuellement le ${formatDateShort(moveDialog.apt.date)} à ${formatTime(moveDialog.apt.time)}` : ''}
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Nouvelle date</label>
              <Input
                type="date"
                value={moveDialog.date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setMoveDialog((p) => ({ ...p, date: e.target.value, time: '' }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Nouvelle heure</label>
              <Select
                value={moveDialog.time || undefined}
                onValueChange={(v) => setMoveDialog((p) => ({ ...p, time: v }))}
                disabled={!moveDialog.date || moveLoadingSlots}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!moveDialog.date ? 'Choisir une date' : moveLoadingSlots ? 'Chargement…' : 'Choisir une heure'} />
                </SelectTrigger>
                <SelectContent>
                  {moveSlots.filter((s) => s.available).map((s) => <SelectItem key={s.time} value={s.time}>{s.time}</SelectItem>)}
                </SelectContent>
              </Select>
              {moveDialog.date && !moveLoadingSlots && moveSlots.filter((s) => s.available).length === 0 && (
                <p className="text-xs text-red-500">Aucun créneau libre ce jour.</p>
              )}
            </div>
            {moveError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{moveError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMoveDialog({ open: false, apt: null, date: '', time: '' })}>Annuler</Button>
            <Button onClick={confirmMove} disabled={moving || !moveDialog.date || !moveDialog.time}>
              {moving ? 'Déplacement…' : 'Déplacer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmation statut */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer l&apos;action</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Voulez-vous vraiment <strong>{confirmDialog.label}</strong> ce rendez-vous ?
            {confirmDialog.action === 'cancelled' && ' Un email sera envoyé au patient.'}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}>
              Retour
            </Button>
            <Button
              onClick={handleAction}
              disabled={loading}
              className={confirmDialog.action === 'cancelled' ? 'bg-red-500 hover:bg-red-600' : ''}
            >
              {loading ? 'En cours…' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog d'encaissement (paiements partiels + mode de règlement) */}
      <Dialog
        open={payDialog.open}
        onOpenChange={(open) => { setPayDialog((prev) => ({ ...prev, open })); if (!open) setPayError('') }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Encaissement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Total dû</label>
                <div className="relative">
                  <Input
                    type="number" inputMode="decimal" min="0" step="any"
                    value={payDialog.due}
                    onChange={(e) => { setPayDialog((p) => ({ ...p, due: e.target.value })); setPayError('') }}
                    placeholder="0"
                    className="pr-9"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">DH</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Encaissé</label>
                <div className="relative">
                  <Input
                    type="number" inputMode="decimal" min="0" step="any" autoFocus
                    value={payDialog.paid}
                    onChange={(e) => { setPayDialog((p) => ({ ...p, paid: e.target.value })); setPayError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmPayment() }}
                    placeholder="0"
                    className="pr-9"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">DH</span>
                </div>
              </div>
            </div>

            {/* Reste à payer + bouton "Solder le reste" */}
            {(() => {
              const due = parseFloat(payDialog.due.replace(',', '.'))
              const paid = parseFloat(payDialog.paid.replace(',', '.'))
              const reste = Math.round((due - paid) * 100) / 100
              if (!isNaN(due) && !isNaN(paid) && reste > 0) {
                return (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-orange-600 font-medium">Reste à payer : {reste} DH</p>
                    <button
                      type="button"
                      onClick={() => { setPayDialog((p) => ({ ...p, paid: p.due })); setPayError('') }}
                      className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 hover:bg-green-100 transition-colors"
                    >
                      Solder le reste
                    </button>
                  </div>
                )
              }
              if (!isNaN(due) && !isNaN(paid) && due > 0 && paid >= due) {
                return <p className="text-xs text-green-600 font-medium">Soldé ✓</p>
              }
              return null
            })()}

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Mode de règlement</label>
              <Select
                value={payDialog.method || undefined}
                onValueChange={(v) => setPayDialog((p) => ({ ...p, method: v as PaymentMethod }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {payError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{payError}</p>}
            {payDialog.paid && (
              <button
                type="button"
                onClick={async () => {
                  setPayError('')
                  try {
                    await onPayment?.(payDialog.id, { amount_paid: null, amount_due: null, payment_method: null })
                    setPayDialog({ open: false, id: '', due: '', paid: '', method: '' })
                  } catch (err) {
                    setPayError(err instanceof Error ? err.message : 'Une erreur est survenue.')
                  }
                }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Annuler le paiement
              </button>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPayDialog({ open: false, id: '', due: '', paid: '', method: '' }); setPayError('') }}>
              Retour
            </Button>
            <Button onClick={handleConfirmPayment} disabled={paying || !payDialog.paid} className="bg-green-600 hover:bg-green-700">
              {paying ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : émettre une facture d'avoir */}
      <Dialog open={creditDialog.open} onOpenChange={(o) => { if (!o) setCreditDialog((p) => ({ ...p, open: false })) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Émettre un avoir</DialogTitle>
          </DialogHeader>
          {creditDone ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-700">
                Avoir <strong>{creditDone.creditNo}</strong> émis pour la facture {creditDialog.invoiceNo}.
              </p>
              <a
                href={`/avoir/${creditDone.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline"
              >
                <Printer className="h-4 w-4" /> Imprimer l'avoir
              </a>
              <DialogFooter>
                <Button onClick={() => setCreditDialog((p) => ({ ...p, open: false }))}>Fermer</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-xs text-gray-500">
                Annule (totalement ou partiellement) la facture <strong>{creditDialog.invoiceNo}</strong>.
                La facture d'origine reste conservée.
              </p>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Montant de l'avoir</label>
                <div className="relative">
                  <Input
                    type="number" min="0" step="0.01"
                    value={creditDialog.amount}
                    onChange={(e) => setCreditDialog((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0"
                    className="pr-9"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">DH</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Motif (optionnel)</label>
                <Input
                  value={creditDialog.reason}
                  onChange={(e) => setCreditDialog((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Ex. erreur de saisie, remboursement…"
                />
              </div>
              {creditError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{creditError}</p>}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCreditDialog((p) => ({ ...p, open: false }))}>Retour</Button>
                <Button onClick={submitCreditNote} disabled={crediting} className="bg-red-600 hover:bg-red-700">
                  {crediting ? 'Émission…' : 'Émettre l\'avoir'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </>
  )
}
