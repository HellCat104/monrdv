'use client'

// « À reprogrammer » — les consignes du médecin qui survivent à la journée.
//
// Il pose la consigne en fin de consultation, puis clôture : le rendez-vous
// passe « parti » et disparaît des listes du jour. Le lendemain, sa phrase
// « revoyez-le dans quinze jours » n'était affichée NULLE PART. C'est le
// genre de consigne qu'on croit transmise et qui se perd entre la porte du
// bureau et le comptoir — exactement ce que cette fonctionnalité devait
// empêcher.
//
// L'encart ne s'affiche que s'il y a quelque chose : un cabinet à jour ne
// porte pas une carte vide, sinon on finit par ne plus la regarder.
import { useCallback, useEffect, useState } from 'react'
import { formatDateShort } from '@/lib/utils'
import { CalendarClock } from 'lucide-react'

interface Consigne {
  id: string
  date: string
  reprogrammer_jours: number
  patient?: { first_name?: string; last_name?: string; phone?: string | null } | null
}

export default function AReprogrammer({ peutSolder = true }: { peutSolder?: boolean }) {
  const [consignes, setConsignes] = useState<Consigne[]>([])

  const charger = useCallback(async () => {
    try {
      const res = await fetch('/api/cabinet/reprogrammer')
      if (!res.ok) return
      const d = await res.json()
      setConsignes(d.consignes ?? [])
    } catch { /* la migration manque, ou le réseau : l'encart n'existe pas */ }
  }, [])

  useEffect(() => { charger() }, [charger])

  async function solder(id: string) {
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reprogrammer_jours: null }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'La consigne n’a pas pu être soldée.')
      return
    }
    setConsignes((prev) => prev.filter((c) => c.id !== id))
  }

  if (consignes.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-2 mb-2">
        <CalendarClock className="h-4 w-4" /> À reprogrammer ({consignes.length})
      </p>
      <div className="space-y-1">
        {consignes.map((c) => {
          const nom = `${c.patient?.first_name ?? ''} ${c.patient?.last_name ?? ''}`.trim() || 'Patient'
          return (
            <div key={c.id} className="flex items-center gap-2 flex-wrap text-sm text-amber-900">
              <span className="font-medium">{nom}</span>
              {/* Le téléphone est là : la consigne se solde en appelant, pas
                  en cherchant le patient dans un autre écran. */}
              {c.patient?.phone && (
                <a href={`tel:${c.patient.phone}`} className="text-amber-800 hover:underline">{c.patient.phone}</a>
              )}
              <span className="text-amber-700">· dans {c.reprogrammer_jours} j</span>
              <span className="text-[11px] text-amber-600">(vu le {formatDateShort(c.date)})</span>
              {peutSolder && (
                <button
                  onClick={() => solder(c.id)}
                  className="ml-auto text-xs font-semibold bg-amber-200/70 hover:bg-amber-200 rounded-lg px-2 py-1"
                >
                  C&apos;est fait
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
