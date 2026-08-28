'use client'

import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { fr } from 'date-fns/locale'
import { addDays, getDay, format, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import 'react-day-picker/dist/style.css'
import type { WorkingHours } from '@/types'
import { toMinutes, DEFAULT_LEAD_HOURS } from '@/lib/utils'

interface DatePickerProps {
  workingHours: WorkingHours
  selectedDate: Date | undefined
  onSelect: (date: Date | undefined) => void
  disabledDates?: Date[]
  /** Heures d'avance exigées pour réserver (0 = immédiat, 24 = dès demain) */
  leadHours?: number
}

const DAY_MAP: Record<number, keyof WorkingHours> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
}

export function DatePicker({ workingHours, selectedDate, onSelect, disabledDates = [], leadHours = DEFAULT_LEAD_HOURS }: DatePickerProps) {
  // Calculé en HEURE MAROC (pas l'heure du navigateur) pour rester cohérent
  // avec le serveur — un patient à l'étranger ne doit pas pouvoir choisir un
  // jour que le serveur refusera ensuite.
  const MAROC_TZ = 'Africa/Casablanca'
  const todayMaroc = formatInTimeZone(new Date(), MAROC_TZ, 'yyyy-MM-dd') // ex: "2026-06-04"
  const tomorrowMaroc = format(addDays(parseISO(todayMaroc), 1), 'yyyy-MM-dd')

  // La journée en cours reste réservable tant qu'il subsiste un créneau après
  // le délai de prévenance du médecin. Passé cette limite (ou si le jour est
  // fermé), la réservation ne commence qu'au lendemain.
  const nowMinutes = toMinutes(formatInTimeZone(new Date(), MAROC_TZ, 'HH:mm'))
  const todayKey = DAY_MAP[getDay(parseISO(todayMaroc))]
  const todaySchedule = workingHours[todayKey]
  const todayStillOpen =
    !!todaySchedule?.enabled &&
    nowMinutes + leadHours * 60 < toMinutes(todaySchedule.end)
  const earliestDate = todayStillOpen ? todayMaroc : tomorrowMaroc

  // Désactive les jours passés, le jour même s'il est trop tard, et les repos
  // Comparaison par date calendaire (string) — immunisé contre les décalages de fuseau
  function isDisabled(date: Date): boolean {
    const dateStr = format(date, 'yyyy-MM-dd')
    if (dateStr < earliestDate) return true
    const dayKey = DAY_MAP[getDay(date)]
    if (!workingHours[dayKey]?.enabled) return true
    return disabledDates.some(
      (d) => format(d, 'yyyy-MM-dd') === dateStr
    )
  }

  return (
    <div className="rdp-container">
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={onSelect}
        disabled={isDisabled}
        locale={fr}
        fromDate={parseISO(earliestDate)}
        toDate={addDays(parseISO(todayMaroc), 60)} // 2 mois à l'avance max
        showOutsideDays={false}
        className="mx-auto"
        classNames={{
          root: 'rdp',
          months: 'rdp-months',
          month: 'rdp-month',
          caption: 'rdp-caption flex items-center justify-between px-2 py-1',
          caption_label: 'text-sm font-semibold text-gray-800 capitalize',
          nav: 'rdp-nav flex gap-1',
          nav_button: 'rdp-nav_button h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 rounded-lg hover:bg-gray-100 flex items-center justify-center',
          nav_button_previous: 'rdp-nav_button_previous',
          nav_button_next: 'rdp-nav_button_next',
          table: 'rdp-table w-full border-collapse mt-2',
          head_row: 'rdp-head_row',
          head_cell: 'rdp-head_cell text-gray-400 rounded-md w-10 font-normal text-xs text-center pb-1',
          row: 'rdp-row mt-0.5',
          cell: 'rdp-cell text-center p-0 relative',
          day: 'rdp-day h-10 w-10 p-0 font-normal text-sm rounded-lg mx-auto flex items-center justify-center hover:bg-primary-50 hover:text-primary-600 aria-selected:opacity-100',
          day_selected: 'rdp-day_selected bg-primary-500 text-white hover:bg-primary-600 hover:text-white',
          day_today: 'rdp-day_today font-bold text-primary-500',
          day_outside: 'rdp-day_outside opacity-50',
          day_disabled: 'rdp-day_disabled opacity-30 cursor-not-allowed hover:bg-transparent hover:text-inherit',
          day_hidden: 'rdp-day_hidden invisible',
        }}
      />
      <style>{`
        .rdp { margin: 0; }
        .rdp-months { justify-content: center; }
        .rdp-month { width: 100%; }
      `}</style>
    </div>
  )
}
