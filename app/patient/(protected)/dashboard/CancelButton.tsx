'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface CancelButtonProps {
  appointmentId: string
}

export function CancelButton({ appointmentId }: CancelButtonProps) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading'>('idle')
  const [error, setError] = useState('')

  // Réinitialise l'état si le composant est réutilisé pour un autre RDV
  // (évite que "Annulation…" reste collé sur un RDV qui remonte dans la liste)
  useEffect(() => {
    setStep('idle')
    setError('')
  }, [appointmentId])

  async function handleCancel() {
    setStep('loading')
    const res = await fetch(`/api/patient/appointments/${appointmentId}/cancel`, {
      method: 'POST',
    })
    if (res.ok) {
      router.refresh()
    } else {
      setError('Erreur lors de l\'annulation')
      setStep('idle')
    }
  }

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('confirm')}
        className="text-xs text-red-400 hover:underline"
      >
        Annuler
      </button>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-xs text-red-500 font-medium">Confirmer ?</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="text-xs bg-red-500 text-white px-2 py-1 rounded-md hover:bg-red-600"
          >
            Oui
          </button>
          <button
            onClick={() => setStep('idle')}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Non
          </button>
        </div>
      </div>
    )
  }

  return <p className="text-xs text-gray-400">Annulation…</p>
}
