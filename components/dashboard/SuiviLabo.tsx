'use client'

// Encart « Laboratoire » du tableau de bord.
//
// Il ne s'affiche QUE s'il y a quelque chose à voir : un travail en retard, ou
// attendu dans les sept jours. Un cabinet sans travail en cours ne doit pas
// porter une carte vide — c'est précisément ce qui fait qu'on finit par ne
// plus regarder l'écran.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import { enRetard, attenduBientot, titreTravail, type LabWork } from '@/lib/labo'
import { FlaskConical } from 'lucide-react'

type Travail = LabWork & { patient?: { first_name?: string; last_name?: string } | null }

export default function SuiviLabo() {
  const [travaux, setTravaux] = useState<Travail[]>([])
  const aujourdhui = getNowInMaroc().toISOString().slice(0, 10)

  useEffect(() => {
    fetch('/api/lab-works?suivi=1')
      .then((r) => (r.ok ? r.json() : { travaux: [] }))
      .then((d) => setTravaux(d.travaux ?? []))
      .catch(() => { /* ni table ni forfait : l'encart n'existe pas */ })
  }, [])

  const retard = travaux.filter((t) => enRetard(t, aujourdhui))
  const bientot = travaux.filter((t) => attenduBientot(t, aujourdhui, 7))
  if (retard.length === 0 && bientot.length === 0) return null

  const Ligne = ({ t, alerte }: { t: Travail; alerte: boolean }) => {
    const nom = `${t.patient?.first_name ?? ''} ${t.patient?.last_name ?? ''}`.trim()
    return (
      <Link
        href={`/patients/${t.patient_id}`}
        className="flex items-center gap-2 py-1.5 text-sm hover:bg-gray-50 rounded px-1"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${alerte ? 'bg-red-500' : 'bg-amber-400'}`} />
        <span className="font-medium text-gray-800 truncate">{nom || 'Patient'}</span>
        <span className="text-gray-400 truncate">{titreTravail(t)}</span>
        <span className={`ml-auto shrink-0 tabular-nums ${alerte ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {t.due_at ? formatDateShort(t.due_at) : ''}
        </span>
      </Link>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary-500" /> Laboratoire
          {retard.length > 0 && (
            <span className="text-xs font-semibold text-red-600">
              {retard.length} en retard
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {retard.map((t) => <Ligne key={t.id} t={t} alerte />)}
        {bientot.map((t) => <Ligne key={t.id} t={t} alerte={false} />)}
        <p className="text-[11px] text-gray-400 mt-2">
          Travaux attendus cette semaine. En rouge : la date de retour est passée.
        </p>
      </CardContent>
    </Card>
  )
}
