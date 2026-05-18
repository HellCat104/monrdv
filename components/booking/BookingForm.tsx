'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateShort, formatTime } from '@/lib/utils'
import { CheckCircle2, User, Phone, MessageSquare } from 'lucide-react'
import type { Doctor } from '@/types'

interface BookingFormProps {
  doctor: Doctor
  selectedDate: string  // YYYY-MM-DD
  selectedTime: string  // HH:mm
  onBack: () => void
  onSuccess: () => void
}

export function BookingForm({ doctor, selectedDate, selectedTime, onBack, onSuccess }: BookingFormProps) {
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: doctor.id,
          date: selectedDate,
          time: selectedTime,
          ...form,
          public: true, // indique que c'est une réservation publique
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de la réservation')
      }

      setConfirmed(true)
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  if (confirmed) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">Rendez-vous confirmé !</h3>
        <p className="text-gray-600 text-sm">
          Votre rendez-vous avec <strong>Dr. {doctor.name}</strong> est prévu le{' '}
          <strong>{formatDateShort(selectedDate)}</strong> à{' '}
          <strong>{formatTime(selectedTime)}</strong>.
        </p>
        <p className="text-gray-500 text-xs">
          Un SMS de confirmation a été envoyé sur votre téléphone.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Récapitulatif du créneau choisi */}
      <div className="bg-primary-50 border border-primary-100 rounded-xl p-4">
        <p className="text-sm font-medium text-primary-700">Votre rendez-vous</p>
        <p className="text-lg font-bold text-primary-900 mt-1">
          {formatDateShort(selectedDate)} à {formatTime(selectedTime)}
        </p>
        <p className="text-xs text-primary-600">Dr. {doctor.name} — {doctor.specialty}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="b_first_name" className="flex items-center gap-1.5">
              <User className="h-3 w-3" /> Prénom *
            </Label>
            <Input
              id="b_first_name"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              placeholder="Mohammed"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b_last_name">Nom *</Label>
            <Input
              id="b_last_name"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              placeholder="Alami"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b_phone" className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" /> Téléphone *
          </Label>
          <Input
            id="b_phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="06 12 34 56 78"
            required
          />
          <p className="text-xs text-gray-400">Vous recevrez une confirmation par SMS</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b_notes" className="flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" /> Motif (optionnel)
          </Label>
          <Textarea
            id="b_notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Décrivez brièvement le motif de votre consultation…"
            rows={2}
          />
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Retour
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? 'Réservation…' : 'Confirmer le RDV'}
          </Button>
        </div>
      </form>
    </div>
  )
}
