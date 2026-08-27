'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { TimeSlots } from '@/components/booking/TimeSlots'
import { BookingForm } from '@/components/booking/BookingForm'
import { Stethoscope, MapPin, Clock, ClipboardList, Phone, Mail } from 'lucide-react'

// Convertit un numéro marocain en format international pour wa.me (ex. 0612… → 212612…)
function waNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('212')) return digits
  if (digits.startsWith('0')) return '212' + digits.slice(1)
  return digits
}
import type { Doctor, TimeSlot, ConsultationType } from '@/types'
import { displayName } from '@/lib/profession'

// Chargement différé du calendrier — réduit le JS initial de ~30 kB
const DatePicker = dynamic(
  () => import('@/components/booking/DatePicker').then((m) => m.DatePicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 bg-gray-50 rounded-xl animate-pulse flex items-center justify-center">
        <span className="text-sm text-gray-400">Chargement du calendrier…</span>
      </div>
    ),
  }
)

// La page publique ne transmet JAMAIS les colonnes sensibles (email, etc.)
// au navigateur — voir la projection dans app/[slug]/page.tsx.
type PublicDoctor = Omit<Doctor, 'email' | 'created_at'>

interface Props {
  doctor: PublicDoctor
  consultationTypes?: ConsultationType[]
}

// Étapes de réservation
type Step = 'datetime' | 'form' | 'success'

export function BookingPageClient({ doctor, consultationTypes = [] }: Props) {
  const [step, setStep] = useState<Step>('datetime')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotTakenMsg, setSlotTakenMsg] = useState(false)
  const [blockedDates, setBlockedDates] = useState<Date[]>([])
  // Motif de consultation choisi (obligatoire si le médecin en a défini)
  const hasTypes = consultationTypes.length > 0
  const [selectedType, setSelectedType] = useState<ConsultationType | null>(null)
  // Spécialités (médecin multi-spécialités) : choix par le patient si plusieurs
  const specialties = (doctor.specialties && doctor.specialties.length > 0) ? doctor.specialties : [doctor.specialty]
  const hasMultiSpec = specialties.length > 1
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(hasMultiSpec ? null : (specialties[0] ?? null))

  // Charge uniquement les journées entièrement indisponibles. Les motifs de
  // blocage restent privés au cabinet.
  useEffect(() => {
    fetch(`/api/blocked-dates?doctor_id=${doctor.id}`)
      .then((r) => r.json())
      .then((data) => {
        setBlockedDates((data.blocked ?? []).map((d: string) => new Date(d + 'T00:00:00')))
      })
      .catch(() => {})
  }, [doctor.id])

  // Charge les créneaux disponibles dès qu'une date est sélectionnée
  // (et recharge si le motif change — la durée des créneaux en dépend)
  useEffect(() => {
    if (!selectedDate) {
      setSlots([])
      setSelectedTime(null)
      return
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    setSelectedTime(null)
    setLoadingSlots(true)

    const typeParam = selectedType ? `&type=${selectedType.id}` : ''
    fetch(`/api/slots?doctor_id=${doctor.id}&date=${dateStr}${typeParam}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate, doctor.id, selectedType])

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
      const typeParam = selectedType ? `&type=${selectedType.id}` : ''
      fetch(`/api/slots?doctor_id=${doctor.id}&date=${dateStr}${typeParam}`)
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
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-sm leading-tight">MonRDV</h1>
              <p className="text-xs text-gray-400">Prise de rendez-vous en ligne</p>
            </div>
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Carte médecin */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start gap-4">
            {/* Avatar ou photo */}
            {doctor.photo_url ? (
              <Image
                src={doctor.photo_url}
                alt={displayName(doctor.name, doctor.specialty)}
                width={64}
                height={64}
                className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-gray-100"
                priority
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
              <p className="text-primary-600 font-medium text-sm mt-0.5">{specialties.join(' · ')}</p>
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

          {/* Contacter le médecin */}
          {(doctor.whatsapp || doctor.phone || doctor.public_email) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Contacter le médecin</p>
              <div className="flex flex-wrap gap-2">
                {doctor.whatsapp && (
                  <a
                    href={`https://wa.me/${waNumber(doctor.whatsapp)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2.3 1.3 1.1 2.3 1.5 2.6 1.6.3.1.5.1.7-.1l.8-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.6.3.1.2.1.7-.1 1.2Z"/></svg>
                    WhatsApp
                  </a>
                )}
                {doctor.phone && (
                  <a
                    href={`tel:${doctor.phone}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:border-primary-300 hover:text-primary-600 transition-colors"
                  >
                    <Phone className="h-4 w-4" /> Appeler
                  </a>
                )}
                {doctor.public_email && (
                  <a
                    href={`mailto:${doctor.public_email}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:border-primary-300 hover:text-primary-600 transition-colors"
                  >
                    <Mail className="h-4 w-4" /> Email
                  </a>
                )}
              </div>
            </div>
          )}
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

              {/* Choix de la spécialité (si le médecin en a plusieurs) */}
              {hasMultiSpec && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-primary-500" />
                    Pour quelle spécialité ?
                  </h3>
                  <div className="grid gap-2">
                    {specialties.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSpecialty(s)}
                        className={`px-4 py-3 rounded-xl border-2 text-left text-sm font-medium transition-all ${
                          selectedSpecialty === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-700 hover:border-primary-200'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Choix du motif (si le médecin a défini des motifs) */}
              {hasTypes && (!hasMultiSpec || selectedSpecialty) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary-500" />
                    Motif de votre visite
                  </h3>
                  <div className="grid gap-2">
                    {consultationTypes.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedType(t)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          selectedType?.id === t.id
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-primary-200'
                        }`}
                      >
                        <span className={`text-sm font-medium ${selectedType?.id === t.id ? 'text-primary-700' : 'text-gray-700'}`}>
                          {t.name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 ml-3">{t.duration_minutes} min</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Calendrier — affiché après spécialité + motif (selon le médecin) */}
              {(!hasMultiSpec || selectedSpecialty) && (!hasTypes || selectedType) && (
                <>
              <h3 className="font-semibold text-gray-800">Choisissez une date</h3>
              <DatePicker
                workingHours={doctor.working_hours}
                selectedDate={selectedDate}
                onSelect={handleDateSelect}
                disabledDates={blockedDates}
              />
                </>
              )}

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
              consultationType={selectedType}
              specialty={selectedSpecialty}
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
                Un email de confirmation vous a été envoyé.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <button
                  onClick={() => { setStep('datetime'); setSelectedDate(undefined); setSelectedTime(null) }}
                  className="border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Prendre un autre rendez-vous
                </button>
                <a
                  href="/"
                  className="border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Retour à l&apos;accueil
                </a>
              </div>
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
