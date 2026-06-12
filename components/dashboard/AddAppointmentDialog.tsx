'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateTimeSlots, getDayBreaks } from '@/lib/utils'
import type { Doctor } from '@/types'

interface AddAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  doctor: Doctor
  onSuccess: () => void
}

export function AddAppointmentDialog({
  open,
  onOpenChange,
  doctor,
  onSuccess,
}: AddAppointmentDialogProps) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    date: '',
    time: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Génère les créneaux disponibles selon les horaires du médecin
  const selectedDate = form.date ? new Date(form.date) : null
  const dayNames: Record<number, keyof typeof doctor.working_hours> = {
    0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
    4: 'thursday', 5: 'friday', 6: 'saturday',
  }
  const dayKey = selectedDate ? dayNames[selectedDate.getDay()] : null
  const daySchedule = dayKey ? doctor.working_hours[dayKey] : null
  const timeSlots = daySchedule?.enabled
    ? generateTimeSlots(daySchedule.start, daySchedule.end, doctor.appointment_duration, getDayBreaks(daySchedule))
    : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, doctor_id: doctor.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de la création')
      }
      onSuccess()
      onOpenChange(false)
      setForm({ first_name: '', last_name: '', phone: '', date: '', time: '', notes: '' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau rendez-vous</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">Prénom *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="Mohammed"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Nom *</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Alami"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Téléphone *</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="06 12 34 56 78"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value, time: '' })}
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Heure *</Label>
              <Select
                value={form.time}
                onValueChange={(v) => setForm({ ...form, time: v })}
                disabled={!form.date || timeSlots.length === 0}
              >
                <SelectTrigger id="time">
                  <SelectValue placeholder={!form.date ? 'Choisir date' : 'Heure'} />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.date && daySchedule && !daySchedule.enabled && (
                <p className="text-xs text-red-500">Jour de repos</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Motif de consultation</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Consultation générale, suivi, urgence…"
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading || !form.time}>
              {loading ? 'En cours…' : 'Créer le RDV'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
