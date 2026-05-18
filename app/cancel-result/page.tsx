// Page affichée après annulation d'un RDV via le lien SMS
import { Suspense } from 'react'
import { CancelResultContent } from './CancelResultContent'

export default function CancelResultPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-gray-400">Chargement…</div>}>
        <CancelResultContent />
      </Suspense>
    </div>
  )
}
