'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDateShort, formatTime, getInitials } from '@/lib/utils'
import { STATUS_LABELS, STATUS_COLORS } from '@/types'
import type { Appointment, AppointmentStatus } from '@/types'
import { Phone, Clock, FileText, X, RotateCcw } from 'lucide-react'

interface AppointmentListProps {
  appointments: Appointment[]
  onStatusChange?: (id: string, status: AppointmentStatus) => Promise<void>
}

export function AppointmentList({ appointments, onStatusChange }: AppointmentListProps) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    id: string
    action: 'confirmed' | 'cancelled'
    label: string
  }>({ open: false, id: '', action: 'confirmed', label: '' })
  const [loading, setLoading] = useState(false)

  async function handleAction() {
    setLoading(true)
    try {
      await onStatusChange?.(confirmDialog.id, confirmDialog.action)
    } finally {
      setLoading(false)
      setConfirmDialog((prev) => ({ ...prev, open: false }))
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
              {apt.patient
                ? getInitials(apt.patient.first_name, apt.patient.last_name)
                : '?'}
            </div>

            {/* Infos patient */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 text-sm">
                  {apt.patient
                    ? `${apt.patient.first_name} ${apt.patient.last_name}`
                    : 'Patient inconnu'}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[apt.status]}`}
                >
                  {STATUS_LABELS[apt.status]}
                </span>
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

              {apt.notes && (
                <p className="mt-1 text-xs text-gray-400 flex items-start gap-1">
                  <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                  {apt.notes}
                </p>
              )}
            </div>

            {/* Actions */}
            {apt.status !== 'cancelled' && onStatusChange && (
              <div className="flex gap-2 shrink-0">
                {apt.status === 'pending' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-200 hover:bg-green-50 h-8 px-2 text-xs"
                    onClick={() =>
                      setConfirmDialog({
                        open: true,
                        id: apt.id,
                        action: 'confirmed',
                        label: 'confirmer',
                      })
                    }
                  >
                    Confirmer
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-500 border-red-200 hover:bg-red-50 h-8 px-2 text-xs"
                  onClick={() =>
                    setConfirmDialog({
                      open: true,
                      id: apt.id,
                      action: 'cancelled',
                      label: 'annuler',
                    })
                  }
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dialog de confirmation */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer l&apos;action</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Voulez-vous vraiment <strong>{confirmDialog.label}</strong> ce rendez-vous ?
            {confirmDialog.action === 'cancelled' &&
              ' Un SMS sera envoyé au patient.'}
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
            >
              Annuler
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
    </>
  )
}
