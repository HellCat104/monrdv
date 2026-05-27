'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { DatePicker } from '@/components/booking/DatePicker'
import { TimeSlots } from '@/components/booking/TimeSlots'
import { BookingForm } from '@/components/booking/BookingForm'
import { Stethoscope, MapPin, Clock } from 'lucide-react'
import type { Doctor, TimeSlot } from '@/types'

interface Props {
  doctor: Doctor
}

// Étapes de réservation
type Step = 'datetime' | 'form' | 'success'

export function BookingPageClient({ doctor }: Props) {
  const [step, setStep] = useState<Step>('datetime')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotTakenMsg, setSlotTakenMsg] = useState(false)

  // Charge les créneaux disponibles dès qu'une date est sélectionnée
  useEffect(() => {
    if (!selectedDate) {
      setSlots([])
      setSelectedTime(null)
      return
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    setSelectedTime(null)
    setLoadingSlots(true)

    fetch(`/api/slots?doctor_id=${doctor.id}&date=${dateStr}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate, doctor.id])

  function handleDateSelect(date: Date | undefined) {
    setSelectedDate(date)
  }

  function handleTimeSelect(time: string) {
    setSelectedTime(time)
  }

  function handleContinue() {
    if (selectedDate && selectedTime) {
      setStep('form')
    }
  }

  function handleSlotTaken() {
    // Revient à la sélection et rafraîchit les créneaux
    setStep('datetime')
    setSelectedTime(null)
    setSlotTakenMsg(true)
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      setLoadingSlots(true)
      fetch(`/api/slots?doctor_id=${doctor.id}&date=${dateStr}`)
        .then((r) => r.json())
        .then((data) => setSlots(data.slots ?? []))
        .finally(() => setLoadingSlots(false))
    }
    setTimeout(() => setSlotTakenMsg(false), 5000)
  }

  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm leading-tight">MonRDV</h1>
            <p className="text-xs text-gray-400">Prise de rendez-vous en ligne</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Carte médecin */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start gap-4">
            {/* Avatar ou photo */}
            {doctor.photo_url ? (
              <img
                src={doctor.photo_url}
                alt={`Dr. ${doctor.name}`}
                className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-gray-100"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-primary-600">
                  {doctor.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">Dr. {doctor.name}</h2>
              <p className="text-primary-600 font-medium text-sm mt-0.5">{doctor.specialty}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                {doctor.address ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {doctor.address}
                  </span>
                ) : doctor.city ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {doctor.city}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Consultation : {doctor.appointment_duration} min
                </span>
              </div>
              {doctor.bio && (
                <p className="mt-2 text-sm text-gray-500 leading-relaxed line-clamp-3">{doctor.bio}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stepper */}
        {step !== 'success' && (
          <div className="flex items-center gap-2">
            {(['datetime', 'form'] as Step[]).map((s, idx) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step === s
                      ? 'bg-primary-500 text-white'
                      : idx < ['datetime', 'form'].indexOf(step)
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {idx + 1}
                </div>
                <span className={`text-xs font-medium ${step === s ? 'text-primary-600' : 'text-gray-400'}`}>
                  {s === 'datetime' ? 'Date & heure' : 'Vos informations'}
                </span>
                {idx < 1 && <div className="flex-1 h-px bg-gray-200 w-8" />}
              </div>
            ))}
          </div>
        )}

        {/* Contenu selon l'étape */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          {step === 'datetime' && (
            <div className="space-y-5">
              {slotTakenMsg && (
                <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium px-4 py-3 rounded-xl">
                  ⚠️ Ce créneau vient d&apos;être pris. Veuillez en choisir un autre.
                </div>
              )}
              <h3 className="font-semibold text-gray-800">Choisissez une date</h3>
              <DatePicker
                workingHours={doctor.working_hours}
                selectedDate={selectedDate}
                onSelect={handleDateSelect}
              />

              {selectedDate && (
                <>
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="font-semibold text-gray-800 mb-3">
                      Créneaux disponibles
                    </h3>
                    <TimeSlots
                      slots={slots}
                      selectedTime={selectedTime}
                      onSelect={handleTimeSelect}
                      loading={loadingSlots}
                    />
                  </div>

                  {selectedTime && (
                    <button
                      onClick={handleContinue}
                      className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 rounded-xl transition-colors"
                    >
                      Continuer avec {selectedTime}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {step === 'form' && selectedDate && selectedTime && (
            <BookingForm
              doctor={doctor}
              selectedDate={dateStr}
              selectedTime={selectedTime}
              onBack={() => setStep('datetime')}
              onSuccess={() => setStep('success')}
              onSlotTaken={handleSlotTaken}
            />
          )}

          {step === 'success' && (
            <div className="text-center py-8 space-y-4">
              <div className="text-6xl">✅</div>
              <h3 className="text-xl font-bold text-gray-900">Rendez-vous confirmé !</h3>
              <p className="text-gray-600 text-sm">
                Votre RDV avec <strong>Dr. {doctor.name}</strong> a bien été enregistré.
                Un SMS de confirmation vous a été envoyé.
              </p>
              <button
                onClick={() => { setStep('datetime'); setSelectedDate(undefined); setSelectedTime(null) }}
                className="text-primary-500 text-sm underline hover:no-underline"
              >
                Prendre un autre rendez-vous
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Propulsé par <span className="font-medium text-primary-500">MonRDV</span> 🇲🇦
        </p>
      </main>
    </div>
  )
}
