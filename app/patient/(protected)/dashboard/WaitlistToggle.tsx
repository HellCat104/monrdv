'use client'

// Interrupteur « Prévenez-moi si un créneau se libère plus tôt » d'un rendez-vous
// à venir (liste d'attente, v56). L'état affiché est TOUJOURS celui que le
// serveur a confirmé : pas de bascule optimiste. Un interrupteur qui montre
// « activé » alors que l'inscription a été refusée ferait attendre au patient
// un e-mail qui ne viendra jamais.

import { useState, useEffect } from 'react'

export function WaitlistToggle({ appointmentId, inscritInitial }: { appointmentId: string; inscritInitial: boolean }) {
  const [inscrit, setInscrit] = useState(inscritInitial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Même précaution que CancelButton : la liste peut réutiliser le composant
  // pour un autre rendez-vous après router.refresh().
  useEffect(() => {
    setInscrit(inscritInitial)
    setError('')
  }, [appointmentId, inscritInitial])

  async function basculer() {
    const voulu = !inscrit
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/patient/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointmentId, inscrire: voulu }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'La modification n\'a pas pu être enregistrée.')
        return
      }
      setInscrit(data.inscrit === true)
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2">
      <label className="inline-flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={inscrit}
          disabled={loading}
          onChange={basculer}
          className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500 shrink-0"
        />
        <span className="text-xs text-gray-600">
          Prévenez-moi si un créneau se libère plus tôt
          {loading && <span className="text-gray-400"> — enregistrement…</span>}
        </span>
      </label>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
