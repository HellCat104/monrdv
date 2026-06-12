'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateShort, formatTime } from '@/lib/utils'
import { CheckCircle2, User, Phone, MessageSquare, Mail, Hash } from 'lucide-react'
import type { Doctor, ConsultationType } from '@/types'

interface BookingFormProps {
  doctor: Doctor
  selectedDate: string  // YYYY-MM-DD
  selectedTime: string  // HH:mm
  consultationType?: ConsultationType | null
  onBack: () => void
  onSuccess: () => void
  onSlotTaken: () => void
}

interface MyProfile {
  email: string
  first_name: string
  last_name: string
  phone: string
  age: number | null
}

export function BookingForm({ doctor, selectedDate, selectedTime, consultationType, onBack, onSuccess, onSlotTaken }: BookingFormProps) {
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', age: '', notes: '' })
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  // Patient connecté : choix "pour moi" / "pour quelqu'un d'autre"
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null)
  const [bookingFor, setBookingFor] = useState<'me' | 'other'>('me')

  // Au chargement, vérifie si un patient est connecté
  useEffect(() => {
    fetch('/api/patient/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MyProfile | null) => {
        if (data && data.email) {
          setMyProfile(data)
          // Pré-remplit avec les infos du compte
          setForm((f) => ({
            ...f,
            first_name: data.first_name,
            last_name: data.last_name,
            phone: data.phone,
            email: data.email,
            age: data.age != null ? String(data.age) : '',
          }))
        }
      })
      .catch(() => {})
  }, [])

  function chooseBookingFor(who: 'me' | 'other') {
    setBookingFor(who)
    if (who === 'me' && myProfile) {
      setForm((f) => ({
        ...f,
        first_name: myProfile.first_name,
        last_name: myProfile.last_name,
        phone: myProfile.phone,
        email: myProfile.email,
        age: myProfile.age != null ? String(myProfile.age) : '',
      }))
    } else {
      // Pour quelqu'un d'autre : on vide les champs identité
      setForm((f) => ({ ...f, first_name: '', last_name: '', phone: '', email: '', age: '' }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!consent) {
      setError('Vous devez accepter le traitement de vos données de santé pour continuer.')
      return
    }
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
          age: form.age ? parseInt(form.age, 10) : undefined,
          consultation_type_id: consultationType?.id ?? undefined,
          public: true, // indique que c'est une réservation publique
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (res.status === 409) {
          onSlotTaken()
          return
        }
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
      <div className="text-center py-6 space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">Rendez-vous confirmé !</h3>
        <p className="text-gray-600 text-sm">
          Votre rendez-vous avec <strong>Dr. {doctor.name}</strong> est prévu le{' '}
          <strong>{formatDateShort(selectedDate)}</strong> à{' '}
          <strong>{formatTime(selectedTime)}</strong>.
        </p>
        {form.email && (
          <p className="text-gray-500 text-xs">
            Un email de confirmation a été envoyé à <strong>{form.email}</strong>.
          </p>
        )}
        {/* CTA créer un compte */}
        <div className="mt-4 bg-primary-50 border border-primary-100 rounded-xl p-4 text-left space-y-2">
          <p className="text-sm font-semibold text-primary-800">Retrouvez vos RDV facilement</p>
          <p className="text-xs text-primary-600">Créez un compte patient gratuit pour voir tous vos rendez-vous en un seul endroit.</p>
          <a
            href="/patient/login"
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors mt-1"
          >
            Créer mon espace patient
          </a>
        </div>
        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <a
            href="/"
            className="flex-1 border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors text-center"
          >
            Retour à l&apos;accueil
          </a>
          <a
            href="/recherche"
            className="flex-1 border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors text-center"
          >
            Prendre un autre RDV
          </a>
        </div>
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
        {consultationType && (
          <p className="text-xs text-primary-600 mt-0.5">
            Motif : <strong>{consultationType.name}</strong> ({consultationType.duration_minutes} min)
          </p>
        )}
      </div>

      {/* Choix pour qui — uniquement si patient connecté */}
      {myProfile && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Ce rendez-vous est pour…</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => chooseBookingFor('me')}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                bookingFor === 'me'
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              Moi
            </button>
            <button
              type="button"
              onClick={() => chooseBookingFor('other')}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                bookingFor === 'other'
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              Quelqu&apos;un d&apos;autre
            </button>
          </div>
          {bookingFor === 'other' && (
            <p className="text-xs text-gray-400">Entrez les informations de la personne concernée par le rendez-vous.</p>
          )}
        </div>
      )}

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
          <p className="text-xs text-gray-400">Numéro où vous joindre</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b_email" className="flex items-center gap-1.5">
            <Mail className="h-3 w-3" /> Email *
          </Label>
          <Input
            id="b_email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="vous@exemple.ma"
            required
          />
          <p className="text-xs text-gray-400">Indispensable pour recevoir votre confirmation et votre rappel</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b_age" className="flex items-center gap-1.5">
            <Hash className="h-3 w-3" /> Âge *
          </Label>
          <Input
            id="b_age"
            type="number"
            min={1}
            max={120}
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
            placeholder="35"
            required
          />
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

        {/* Consentement données de santé — OBLIGATOIRE (loi 09-08) */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 shrink-0"
            />
            <span className="text-xs text-blue-800 leading-relaxed">
              J&apos;accepte que mes données personnelles (nom, téléphone, motif) soient transmises à{' '}
              <strong>Dr. {doctor.name}</strong> dans le seul but de gérer mon rendez-vous médical,
              conformément à la{' '}
              <a href="/politique-confidentialite" target="_blank" className="underline hover:text-primary-600">
                politique de confidentialité
              </a>.
              Je peux retirer mon consentement à tout moment.
            </span>
          </label>
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
