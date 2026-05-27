'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDateShort, formatTime, getInitials } from '@/lib/utils'
import { STATUS_LABELS, STATUS_COLORS, ATTENDANCE_LABELS, ATTENDANCE_COLORS } from '@/types'
import type { Appointment, AppointmentStatus, AppointmentAttendance } from '@/types'
import { Phone, Clock, FileText, X, StickyNote, UserCheck, UserX, Timer } from 'lucide-react'

interface AppointmentListProps {
  appointments: Appointment[]
  onStatusChange?: (id: string, status: AppointmentStatus) => Promise<void>
  onAttendanceChange?: (id: string, attendance: AppointmentAttendance) => Promise<void>
  onNotesChange?: (id: string, notes: string) => Promise<void>
}

export function AppointmentList({ appointments, onStatusChange, onAttendanceChange, onNotesChange }: AppointmentListProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; id: string; action: 'confirmed' | 'cancelled'; label: string
  }>({ open: false, id: '', action: 'confirmed', label: '' })
  const [notesDialog, setNotesDialog] = useState<{ open: boolean; id: string; value: string }>({
    open: false, id: '', value: ''
  })
  const [loading, setLoading] = useState(false)
  const [notesLoading, setNotesLoading] = useState(false)

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

  async function handleSaveNotes() {
    setNotesLoading(true)
    try {
      await onNotesChange?.(notesDialog.id, notesDialog.value)
    } finally {
      setNotesLoading(false)
      setNotesDialog((prev) => ({ ...prev, open: false }))
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
                </span>
                {apt.patient && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {apt.patient.phone}
                  </span>
                )}
              </div>

              {/* Notes patient (motif) */}
              {apt.notes && (
                <p className="mt-1 text-xs text-gray-400 flex items-start gap-1">
                  <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                  {apt.notes}
                </p>
              )}

              {/* Notes médecin */}
              {apt.doctor_notes && (
                <p className="mt-1 text-xs text-primary-600 bg-primary-50 rounded px-2 py-1 flex items-start gap-1">
                  <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                  {apt.doctor_notes}
                </p>
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
              {/* Bouton notes */}
              {onNotesChange && apt.status !== 'cancelled' && (
                <button
                  onClick={() => setNotesDialog({ open: true, id: apt.id, value: apt.doctor_notes ?? '' })}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-500 transition-colors"
                  title="Ajouter une note"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                </button>
              )}

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
                    <X className="h-3 w-3" />
                  </Button>
                </div>
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
            {confirmDialog.action === 'cancelled' && ' Un SMS sera envoyé au patient.'}
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

      {/* Dialog notes médecin */}
      <Dialog open={notesDialog.open} onOpenChange={(open) => setNotesDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary-500" />
              Note interne
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400">Visible uniquement par vous, pas par le patient.</p>
          <textarea
            value={notesDialog.value}
            onChange={(e) => setNotesDialog((prev) => ({ ...prev, value: e.target.value }))}
            placeholder="Antécédents, rappels, observations…"
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNotesDialog((prev) => ({ ...prev, open: false }))}>
              Annuler
            </Button>
            <Button onClick={handleSaveNotes} disabled={notesLoading}>
              {notesLoading ? 'Sauvegarde…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
