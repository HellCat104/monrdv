'use client'

// Écran affiché quand un CONTRÔLE D'ACCÈS n'a pas pu être fait — la base n'a
// pas répondu à temps.
//
// Jusqu'ici, ces contrôles lisaient `const { data } = await …` sans regarder
// l'erreur : une panne donnait `data = null`, exactement comme une personne
// sans droits. L'espace cabinet renvoyait alors vers la connexion, qui
// renvoyait vers le tableau de bord, qui renvoyait vers l'espace cabinet.
// Une secrétaire parfaitement autorisée se retrouvait devant une page qui
// charge indéfiniment, sans la moindre explication.
//
// Une panne n'est pas un refus : on le dit, et on propose de réessayer.
import { RefreshCw, ServerCrash } from 'lucide-react'

export default function ServiceIndisponible({ detail }: { detail?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border">
        <ServerCrash className="h-14 w-14 text-amber-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Connexion au serveur impossible</h1>
        <p className="text-gray-500 text-sm mt-2 mb-1">
          Vos identifiants sont bons : c&apos;est notre serveur qui n&apos;a pas
          répondu. Patientez quelques secondes et réessayez.
        </p>
        <p className="text-gray-400 text-xs mb-5">
          Si cela se reproduit, prévenez le cabinet — rien n&apos;a été perdu.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </button>
        {detail ? <p className="text-gray-300 text-[11px] mt-4 break-words">{detail}</p> : null}
      </div>
    </div>
  )
}
