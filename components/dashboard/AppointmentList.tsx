'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDateShort, formatTime, getInitials } from '@/lib/utils'
import { STATUS_LABELS, STATUS_COLORS, ATTENDANCE_LABELS, ATTENDANCE_COLORS } from '@/types'
import type { Appointment, AppointmentStatus, AppointmentAttendance } from '@/types'
import { Phone, Clock, UserCheck, UserX, Timer, User, DoorOpen, Wallet, Printer, ClipboardList, FileText } from 'lucide-react'

interface AppointmentListProps {
  appointments: Appointment[]
  onStatusChange?: (id: string, status: AppointmentStatus) => Promise<void>
  onAttendanceChange?: (id: string, attendance: AppointmentAttendance) => Promise<void>
  onPayment?: (id: string, amount: number | null) => Promise<void>
  onViewPatient?: (patientId: string) => void
}

export function AppointmentList({ appointments, onStatusChange, onAttendanceChange, onPayment, onViewPatient }: AppointmentListProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; id: string; action: 'confirmed' | 'cancelled'; label: string
  }>({ open: false, id: '', action: 'confirmed', label: '' })
  const [loading, setLoading] = useState(false)
  // Dialog de saisie du montant payé
  const [payDialog, setPayDialog] = useState<{ open: boolean; id: string; amount: string }>(
    { open: false, id: '', amount: '' }
  )
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

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

  // "Patient arrivé" → marque présent puis ouvre directement la fiche patient
  async function handleArrived(apt: Appointment) {
    await onAttendanceChange?.(apt.id, 'present')
    if (apt.patient_id) onViewPatient?.(apt.patient_id)
  }

  async function handleConfirmPayment() {
    const amount = parseFloat(payDialog.amount.replace(',', '.'))
    if (isNaN(amount) || amount < 0) {
      setPayError('Veuillez saisir un montant valide.')
      return
    }
    setPayError('')
    setPaying(true)
    try {
      await onPayment?.(payDialog.id, amount)
      setPayDialog({ open: false, id: '', amount: '' })
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setPaying(false)
    }
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
        {appointments.map((apt) => (
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
                {apt.amount_paid != null && (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <Wallet className="h-3 w-3" />
                    {apt.amount_paid} DH payés
                  </span>
                )}
              </div>

              {/* Patient arrivé + Payé — actions rapides du jour */}
              {apt.status === 'confirmed' && (
                <div className="flex gap-1.5 mt-2 flex-wrap max-w-full">
                  {onAttendanceChange && (
                    <button
                      onClick={() => handleArrived(apt)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary-500 text-white hover:bg-primary-600 transition-colors font-medium"
                    >
                      <DoorOpen className="h-3 w-3" /> Patient arrivé
                    </button>
                  )}
                  {onPayment && (
                    <button
                      onClick={() => setPayDialog({ open: true, id: apt.id, amount: apt.amount_paid != null ? String(apt.amount_paid) : (apt.consultation_type?.default_price != null ? String(apt.consultation_type.default_price) : '') })}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                        apt.amount_paid != null
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : 'border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600'
                      }`}
                    >
                      <Wallet className="h-3 w-3" /> {apt.amount_paid != null ? 'Modifier paiement' : 'Payé'}
                    </button>
                  )}
                  {onViewPatient && apt.patient_id && (
                    <a
                      href={`/ordonnance/${apt.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors font-medium"
                    >
                      <FileText className="h-3 w-3" /> Ordonnance
                    </a>
                  )}
                  {apt.amount_paid != null && (
                    <a
                      href={`/facture/${apt.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors font-medium"
                    >
                      <Printer className="h-3 w-3" /> Facture
                    </a>
                  )}
                </div>
              )}

              {/* Boutons présence — uniquement pour les RDV confirmés */}
              {apt.status === 'confirmed' && onAttendanceChange && (
                <div className="flex gap-1.5 mt-2 flex-wrap max-w-full">
                  <button
                    onClick={() => handleAttendance(apt.id, apt.attendance === 'present' ? null : 'present')}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                      apt.attendance === 'present'
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'border-gray-200 text-gray-400 hover:border-green-200 hover:text-green-600'
                    }`}
                  >
                    <UserCheck className="h-3 w-3" /> Présent
                  </button>
                  <button
                    onClick={() => handleAttendance(apt.id, apt.attendance === 'late' ? null : 'late')}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                      apt.attendance === 'late'
                        ? 'bg-orange-100 text-orange-700 border-orange-200'
                        : 'border-gray-200 text-gray-400 hover:border-orange-200 hover:text-orange-600'
                    }`}
                  >
                    <Timer className="h-3 w-3" /> Retard
                  </button>
                  <button
                    onClick={() => handleAttendance(apt.id, apt.attendance === 'absent' ? null : 'absent')}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                      apt.attendance === 'absent'
                        ? 'bg-red-100 text-red-700 border-red-200'
                        : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-600'
                    }`}
                  >
                    <UserX className="h-3 w-3" /> Absent
                  </button>
                </div>
              )}
            </div>

            {/* Actions droite */}
            <div className="flex flex-col gap-1.5 shrink-0 items-end">
              {/* Confirmer / Annuler */}
              {apt.status !== 'cancelled' && onStatusChange && (
                <div className="flex gap-2">
                  {apt.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-200 hover:bg-green-50 h-8 px-2 text-xs"
                      onClick={() => setConfirmDialog({ open: true, id: apt.id, action: 'confirmed', label: 'confirmer' })}
                    >
                      Confirmer
                    </Button>
                  )}
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

      {/* Dialog saisie du montant payé */}
      <Dialog
        open={payDialog.open}
        onOpenChange={(open) => { setPayDialog((prev) => ({ ...prev, open })); if (!open) setPayError('') }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Montant encaissé</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                autoFocus
                value={payDialog.amount}
                onChange={(e) => { setPayDialog((prev) => ({ ...prev, amount: e.target.value })); setPayError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmPayment() }}
                placeholder="0"
                className="pr-12 text-lg"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">DH</span>
            </div>
            {payError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{payError}</p>}
            {payDialog.amount && (
              <button
                type="button"
                onClick={async () => {
                  setPayError('')
                  try {
                    await onPayment?.(payDialog.id, null)
                    setPayDialog({ open: false, id: '', amount: '' })
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
            <Button variant="outline" onClick={() => { setPayDialog({ open: false, id: '', amount: '' }); setPayError('') }}>
              Retour
            </Button>
            <Button onClick={handleConfirmPayment} disabled={paying || !payDialog.amount} className="bg-green-600 hover:bg-green-700">
              {paying ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}
