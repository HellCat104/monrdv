'use client'

// Barre d'actions du certificat (masquée à l'impression).
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function PrintBar() {
  return (
    <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between gap-2 print:hidden">
      <a href="/patients" className="text-sm text-gray-500 hover:text-gray-700">← Retour aux patients</a>
      <Button size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4 mr-2" /> Imprimer / PDF
      </Button>
    </div>
  )
}
