'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { format } from 'date-fns'
import type { Doctor, ConsultationType, TimeSlot } from '@/types'

interface AddAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  doctor: Doctor
  onSuccess: () => void
}

// Valeur "aucun motif" du Select (durée de base du médecin)
const NO_TYPE = '__none__'

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
  const [typeId, setTypeId] = useState<string>(NO_TYPE)
  const [recurFreq, setRecurFreq] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none')
  const [recurCount, setRecurCount] = useState(4)
  const [consultTypes, setConsultTypes] = useState<ConsultationType[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  // Charge les motifs du médecin à l'ouverture
  useEffect(() => {
    if (!open) return
    supabase
      .from('consultation_types')
      .select('*')
      .eq('doctor_id', doctor.id)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .then(({ data }) => setConsultTypes(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctor.id])

  // Recharge les créneaux quand la date ou le motif change
  // (durée variable + exclusion des créneaux déjà pris, gérés par l'API)
  useEffect(() => {
    if (!form.date) { setSlots([]); return }
    setLoadingSlots(true)
    const typeParam = typeId !== NO_TYPE ? `&type=${typeId}` : ''
    fetch(`/api/slots?doctor_id=${doctor.id}&date=${form.date}${typeParam}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }, [form.date, typeId, doctor.id])

  const availableSlots = slots.filter((s) => s.available)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          doctor_id: doctor.id,
          consultation_type_id: typeId !== NO_TYPE ? typeId : undefined,
          recurrence: recurFreq !== 'none' ? { freq: recurFreq, count: recurCount } : undefined,
          public: false,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de la création')
      }
      onSuccess()
      onOpenChange(false)
      setForm({ first_name: '', last_name: '', phone: '', date: '', time: '', notes: '' })
      setTypeId(NO_TYPE)
      setRecurFreq('none'); setRecurCount(4)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const hasTypes = consultTypes.length > 0

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

          {/* Motif (si le médecin a défini des motifs) — ajuste la durée du créneau */}
          {hasTypes && (
            <div className="space-y-1.5">
              <Label htmlFor="motif">Motif</Label>
              <Select value={typeId} onValueChange={(v) => { setTypeId(v); setForm((f) => ({ ...f, time: '' })) }}>
                <SelectTrigger id="motif">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TYPE}>Durée standard ({doctor.appointment_duration} min)</SelectItem>
                  {consultTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.duration_minutes} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
                disabled={!form.date || loadingSlots || availableSlots.length === 0}
              >
                <SelectTrigger id="time">
                  <SelectValue placeholder={!form.date ? 'Choisir date' : loadingSlots ? 'Chargement…' : 'Heure'} />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.map((slot) => (
                    <SelectItem key={slot.time} value={slot.time}>{slot.time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.date && !loadingSlots && availableSlots.length === 0 && (
                <p className="text-xs text-red-500">Aucun créneau disponible ce jour</p>
              )}
            </div>
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
                <Label htmlFor="rcount">Nombre de séances</Label>
                <Input id="rcount" type="number" min={2} max={26} value={recurCount}
                  onChange={(e) => setRecurCount(Math.min(26, Math.max(2, Number(e.target.value) || 2)))} />
              </div>
            )}
          </div>
          {recurFreq !== 'none' && (
            <p className="text-xs text-gray-500 -mt-2">{recurCount} rendez-vous à {form.time || '—'}, {recurFreq === 'weekly' ? 'chaque semaine' : recurFreq === 'biweekly' ? 'toutes les 2 semaines' : 'chaque mois'}. Chacun reste déplaçable séparément.</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Précisions, observations…"
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
