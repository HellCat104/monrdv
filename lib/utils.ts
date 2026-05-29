import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parse, addMinutes, isBefore, isAfter, parseISO } from 'date-fns'
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import type { WorkingHours, TimeSlot } from '@/types'

// Fuseau horaire Maroc (GMT+1)
export const MAROC_TZ = 'Africa/Casablanca'

// Fusion des classes Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Retourne la date actuelle au Maroc
export function getNowInMaroc(): Date {
  return toZonedTime(new Date(), MAROC_TZ)
}

// Formate une date en français
export function formatDateFr(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatInTimeZone(d, MAROC_TZ, 'EEEE d MMMM yyyy', { locale: undefined })
}

// Formate une date courte (ex: "18/05/2026")
export function formatDateShort(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

// Formate l'heure (ex: "09:30")
export function formatTime(time: string): string {
  return time.substring(0, 5)
}

// Génère tous les créneaux horaires d'une journée selon les horaires du médecin
export function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMinutes: number
): string[] {
  const slots: string[] = []
  const baseDate = new Date(2000, 0, 1) // date fictive pour le calcul

  let current = parse(startTime, 'HH:mm', baseDate)
  const end = parse(endTime, 'HH:mm', baseDate)

  while (isBefore(current, end)) {
    const next = addMinutes(current, durationMinutes)
    // Vérifie que le créneau entier rentre dans les horaires
    if (!isAfter(next, end)) {
      slots.push(format(current, 'HH:mm'))
    }
    current = next
  }

  return slots
}

// Filtre les créneaux déjà pris
export function getAvailableSlots(
  allSlots: string[],
  bookedTimes: string[]
): TimeSlot[] {
  return allSlots.map((time) => ({
    time,
    available: !bookedTimes.includes(time),
  }))
}

// Retourne le nom du jour de la semaine en anglais (clé WorkingHours)
export function getDayKey(date: Date): keyof WorkingHours {
  const days: (keyof WorkingHours)[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ]
  return days[date.getDay()]
}

// Formate un numéro de téléphone marocain
export function formatPhoneMaroc(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  // Ajoute l'indicatif Maroc si absent
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+212${cleaned.substring(1)}`
  }
  if (cleaned.startsWith('212')) {
    return `+${cleaned}`
  }
  if (cleaned.startsWith('+212')) {
    return cleaned
  }
  return `+212${cleaned}`
}

// Génère un token cryptographiquement sécurisé pour l'annulation
export function generateCancelToken(): string {
  const { randomBytes } = require('crypto')
  return randomBytes(32).toString('hex')
}

// Retourne les initiales d'un nom
export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

// Tronque un texte
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.substring(0, maxLength)}…`
}
