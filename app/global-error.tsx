'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', backgroundColor: '#f9fafb' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Une erreur est survenue</h1>
            <p style={{ color: '#6b7280', marginBottom: 32, fontSize: 14 }}>
              Notre équipe a été notifiée automatiquement. Veuillez réessayer.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Réessayer
              </button>
              <a
                href="/"
                style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 20px', fontWeight: 600, fontSize: 14, color: '#374151', textDecoration: 'none' }}
              >
                Accueil
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
