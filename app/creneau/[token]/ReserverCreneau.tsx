'use client'

// Boutons de la page /creneau/[token]. Tous les hooks sont en tête de chaque
// composant, avant tout retour anticipé : React exige le même nombre de hooks
// à chaque rendu, et un hook placé après un `return` ferait tomber la page au
// passage d'un état à l'autre.

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

type Succes = { nouveau: string; ancien: string; ancienAnnule: boolean }

export function ReserverCreneau({ token }: { token: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [succes, setSucces] = useState<Succes | null>(null)

  async function reserver() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/waitlist/${encodeURIComponent(token)}`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        setSucces({ nouveau: String(data.nouveau ?? ''), ancien: String(data.ancien ?? ''), ancienAnnule: data.ancienAnnule === true })
        return
      }
      // L'API distingue chaque refus (place prise, créneau passé, offre déjà
      // utilisée…) et envoie la phrase à afficher. On la montre telle quelle ;
      // le repli ne sert que si la réponse n'est pas du JSON.
      setError((data && typeof data.error === 'string' && data.error)
        || 'La réservation n\'a pas pu aboutir. Votre rendez-vous actuel est maintenu.')
    } catch {
      setError('Une erreur est survenue. Réessayez — votre rendez-vous actuel est maintenu.')
    } finally {
      setLoading(false)
    }
  }

  if (succes) {
    return (
      <div className="space-y-3">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
        <p className="text-base font-bold text-gray-900">C&apos;est confirmé !</p>
        <p className="text-sm text-gray-700">
          Votre nouveau rendez-vous : <strong>{succes.nouveau}</strong>.
        </p>
        {succes.ancienAnnule ? (
          <p className="text-xs text-gray-500">Votre ancien rendez-vous du {succes.ancien} est annulé.</p>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
            Votre ancien rendez-vous du {succes.ancien} n&apos;a pas pu être annulé automatiquement.
            Le cabinet a été prévenu ; vous pouvez aussi l&apos;annuler depuis l&apos;e-mail de confirmation.
          </p>
        )}
        <p className="text-xs text-gray-400">Un e-mail de confirmation vous a été envoyé.</p>
        <a
          href="/"
          className="inline-block border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          Retour à l&apos;accueil
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 p-2.5 rounded-lg text-left">{error}</p>}
      <div className="flex flex-col gap-2">
        {/* Désactivé pendant l'envoi : un double clic enverrait deux demandes.
            Le serveur y résiste (verrou sur l'inscription), mais le patient
            verrait alors « offre déjà utilisée » à côté de son succès. */}
        {!error && (
          <button
            onClick={reserver}
            disabled={loading}
            className="bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            {loading ? 'Réservation…' : 'Oui, avancer mon rendez-vous'}
          </button>
        )}
        <a
          href="/"
          className="border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          {error ? 'Retour à l\'accueil' : 'Non merci, garder mon rendez-vous'}
        </a>
        <DesinscriptionListe token={token} />
      </div>
    </div>
  )
}

/** « Ne plus me proposer de créneaux » — la seule issue d'un patient sans compte. */
export function DesinscriptionListe({ token }: { token: string }) {
  const [etat, setEtat] = useState<'idle' | 'loading' | 'fait'>('idle')
  const [message, setMessage] = useState('')

  async function desinscrire() {
    setEtat('loading')
    setMessage('')
    try {
      const res = await fetch(`/api/waitlist/${encodeURIComponent(token)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setEtat('fait')
        setMessage((data && typeof data.message === 'string' && data.message) || 'C\'est noté : vous ne recevrez plus de propositions.')
      } else {
        setEtat('idle')
        setMessage((data && typeof data.error === 'string' && data.error) || 'La désinscription n\'a pas pu être enregistrée.')
      }
    } catch {
      setEtat('idle')
      setMessage('Une erreur est survenue. Réessayez.')
    }
  }

  if (etat === 'fait') return <p className="text-xs text-gray-500 pt-2">{message}</p>

  return (
    <div className="pt-2">
      <button
        onClick={desinscrire}
        disabled={etat === 'loading'}
        className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 disabled:opacity-60"
      >
        {etat === 'loading' ? 'Désinscription…' : 'Ne plus me proposer de créneaux'}
      </button>
      {message && <p className="text-xs text-red-500 mt-1">{message}</p>}
    </div>
  )
}
