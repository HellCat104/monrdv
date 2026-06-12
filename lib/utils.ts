import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parse, addMinutes, isBefore, isAfter, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import type { WorkingHours, TimeSlot, DaySchedule, TimeBreak } from '@/types'

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
  return formatInTimeZone(d, MAROC_TZ, 'EEEE d MMMM yyyy', { locale: fr })
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

// Génère tous les créneaux horaires d'une journée selon les horaires du médecin.
// Exclut les créneaux qui chevauchent la pause déjeuner (si définie).
// Normalise les pauses d'un jour : nouveau format (breaks[]) + ancien (breakStart/breakEnd)
export function getDayBreaks(day: DaySchedule | null | undefined): TimeBreak[] {
  if (!day) return []
  const list = (day.breaks ?? []).filter((b) => b && b.start && b.end)
  if (list.length === 0 && day.breakStart && day.breakEnd) {
    return [{ start: day.breakStart, end: day.breakEnd }]
  }
  return list
}

export function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMinutes: number,
  breaks: TimeBreak[] = []
): string[] {
  const slots: string[] = []
  const baseDate = new Date(2000, 0, 1) // date fictive pour le calcul

  let current = parse(startTime, 'HH:mm', baseDate)
  const end = parse(endTime, 'HH:mm', baseDate)

  // Pré-parse toutes les pauses valides
  const parsedBreaks = breaks
    .filter((b) => b && b.start && b.end)
    .map((b) => ({ s: parse(b.start, 'HH:mm', baseDate), e: parse(b.end, 'HH:mm', baseDate) }))

  while (isBefore(current, end)) {
    const next = addMinutes(current, durationMinutes)
    // Vérifie que le créneau entier rentre dans les horaires
    if (!isAfter(next, end)) {
      // Exclut si le créneau chevauche UNE des pauses : (current < pauseFin) && (next > pauseDébut)
      const overlapsBreak = parsedBreaks.some(
        (b) => isBefore(current, b.e) && isAfter(next, b.s)
      )
      if (!overlapsBreak) {
        slots.push(format(current, 'HH:mm'))
      }
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

// ── Créneaux à durée variable (motifs de consultation) ──────────────────────
// Un RDV existant occupe l'intervalle [time, time + duration). Un candidat est
// disponible si son intervalle complet ne chevauche ni pause ni RDV existant.
export interface OccupiedInterval {
  time: string      // HH:mm ou HH:mm:ss
  duration: number  // minutes
}

// Convertit "HH:mm" (ou "HH:mm:ss") en minutes depuis minuit
export function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

export function getSlotsForDuration(
  startTime: string,
  endTime: string,
  duration: number,       // durée du RDV à placer (selon le motif)
  gridStep: number,       // pas de la grille (durée de base du médecin)
  breaks: TimeBreak[] = [],
  occupied: OccupiedInterval[] = []
): TimeSlot[] {
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  // Grille : ne jamais dépasser la durée demandée (motif court → plus de créneaux)
  const step = Math.max(5, Math.min(gridStep || 30, duration))

  const parsedBreaks = breaks
    .filter((b) => b && b.start && b.end)
    .map((b) => ({ s: toMinutes(b.start), e: toMinutes(b.end) }))

  const parsedOcc = occupied.map((o) => {
    const s = toMinutes(o.time)
    return { s, e: s + (o.duration || gridStep || 30) }
  })

  const slots: TimeSlot[] = []
  for (let t = start; t + duration <= end; t += step) {
    const tEnd = t + duration
    // Chevauche une pause → on ne propose pas du tout le créneau
    if (parsedBreaks.some((b) => t < b.e && tEnd > b.s)) continue
    const taken = parsedOcc.some((o) => t < o.e && tEnd > o.s)
    const hh = String(Math.floor(t / 60)).padStart(2, '0')
    const mm = String(t % 60).padStart(2, '0')
    slots.push({ time: `${hh}:${mm}`, available: !taken })
  }
  return slots
}

// Retourne le nom du jour de la semaine en anglais (clé WorkingHours)
export function getDayKey(date: Date): keyof WorkingHours {
  const days: (keyof WorkingHours)[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ]
  return days[date.getDay()]
}

// Vérifie qu'un numéro est un numéro marocain valide (fixe ou mobile).
// Format normalisé attendu : +212 suivi de 5/6/7 puis 8 chiffres.
export function isValidPhoneMaroc(phone: string): boolean {
  const formatted = formatPhoneMaroc(phone)
  return /^\+212[567]\d{8}$/.test(formatted)
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
