'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard error]', error.digest ?? 'unknown')
  }, [error])

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-gray-500 mb-4">Une erreur est survenue lors du chargement.</p>
        <button
          onClick={reset}
          className="bg-primary-500 hover:bg-primary-600 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
