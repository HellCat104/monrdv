'use client'

import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { fr } from 'date-fns/locale'
import { addDays, isBefore, startOfDay, getDay } from 'date-fns'
import 'react-day-picker/dist/style.css'
import type { WorkingHours } from '@/types'

interface DatePickerProps {
  workingHours: WorkingHours
  selectedDate: Date | undefined
  onSelect: (date: Date | undefined) => void
  disabledDates?: Date[]
}

const DAY_MAP: Record<number, keyof WorkingHours> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
}

export function DatePicker({ workingHours, selectedDate, onSelect, disabledDates = [] }: DatePickerProps) {
  const today = startOfDay(new Date())

  // Désactive les jours de repos et les dates passées
  function isDisabled(date: Date): boolean {
    if (isBefore(date, today)) return true
    const dayKey = DAY_MAP[getDay(date)]
    if (!workingHours[dayKey]?.enabled) return true
    return disabledDates.some(
      (d) => d.toDateString() === date.toDateString()
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
        fromDate={today}
        toDate={addDays(today, 60)} // 2 mois à l'avance max
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
