'use client'

import { cn } from '@/lib/utils'
import type { TimeSlot } from '@/types'
import { Clock } from 'lucide-react'

interface TimeSlotsProps {
  slots: TimeSlot[]
  selectedTime: string | null
  onSelect: (time: string) => void
  loading?: boolean
}

export function TimeSlots({ slots, selectedTime, onSelect, loading }: TimeSlotsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  const available = slots.filter((s) => s.available)

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Sélectionnez une date</p>
      </div>
    )
  }

  if (available.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm font-medium">Aucun créneau disponible</p>
        <p className="text-xs mt-1">Essayez une autre date</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {slots.map(({ time, available: isAvailable }) => (
        <button
          key={time}
          disabled={!isAvailable}
          onClick={() => isAvailable && onSelect(time)}
          className={cn(
            'h-10 rounded-lg text-sm font-medium transition-all border',
            isAvailable
              ? selectedTime === time
                ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-600'
              : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed line-through'
          )}
        >
          {time}
        </button>
      ))}
    </div>
  )
}
