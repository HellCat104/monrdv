// Page affichée après annulation d'un RDV via le lien SMS
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CancelResultContent } from './CancelResultContent'

export const metadata: Metadata = {
  title: 'Annulation de rendez-vous — MonRDV',
  robots: { index: false, follow: false },
}

export default function CancelResultPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-gray-400">Chargement…</div>}>
        <CancelResultContent />
      </Suspense>
    </div>
  )
}
