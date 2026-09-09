'use client'

import { useState } from 'react'

export function CancelConfirm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCancel() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/cancel/${encodeURIComponent(token)}`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const params = new URLSearchParams({ status: 'success' })
        if (data.date) params.set('date', data.date)
        if (data.time) params.set('time', data.time)
        window.location.href = `/cancel-result?${params.toString()}`
      } else {
        // L'API distingue trois refus — rendez-vous passé, acte déjà réglé,
        // lien invalide — et le client les écrasait tous par le même message.
        // Un patient à qui l'on répond « lien invalide » alors que son
        // rendez-vous est simplement passé appelle le cabinet en croyant le
        // site cassé, et celui qui a réglé ne reçoit jamais la seule
        // instruction utile : contacter le cabinet.
        const data = await res.json().catch(() => null)
        setError(
          (data && typeof data.error === 'string' && data.error) ||
          "Ce rendez-vous a déjà été annulé ou le lien n'est plus valide."
        )
        setLoading(false)
      }
    } catch {
      setError('Une erreur est survenue. Réessayez.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500 bg-red-50 p-2.5 rounded-lg">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          onClick={handleCancel}
          disabled={loading}
          className="bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          {loading ? 'Annulation…' : 'Oui, annuler mon rendez-vous'}
        </button>
        <a
          href="/"
          className="border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          Non, garder mon rendez-vous
        </a>
      </div>
    </div>
  )
}
