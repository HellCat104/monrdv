'use client'

import { useSearchParams } from 'next/navigation'
import { formatDateShort, formatTime } from '@/lib/utils'
import { CheckCircle2, XCircle } from 'lucide-react'

export function CancelResultContent() {
  const params = useSearchParams()
  const status = params.get('status')
  const date = params.get('date')
  const time = params.get('time')

  if (status === 'success') {
    return (
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">RDV annulé</h1>
        {date && time && (
          <p className="text-gray-500 text-sm mt-2">
            Votre rendez-vous du <strong>{formatDateShort(date)}</strong> à{' '}
            <strong>{formatTime(time)}</strong> a bien été annulé.
          </p>
        )}
        <p className="text-gray-400 text-xs mt-4">
          Vous pouvez reprendre un rendez-vous en ligne à tout moment.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border">
      <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
      <h1 className="text-xl font-bold text-gray-900">Lien invalide</h1>
      <p className="text-gray-500 text-sm mt-2">
        Ce lien d&apos;annulation est invalide ou a déjà été utilisé.
      </p>
    </div>
  )
}
