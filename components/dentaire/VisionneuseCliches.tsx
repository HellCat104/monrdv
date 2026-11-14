'use client'

// Regarder un cliché SANS quitter le dossier ni la consultation.
//
// Une fenêtre par-dessus l'écran : l'image en grand, sa date, son type, ses
// dents. Avec deux clichés de dates différentes, « Comparer » les pose côte à
// côte — le plus ancien à gauche, comme une frise. Un PDF (compte rendu de
// CBCT, scanner exporté) s'ouvre dans un cadre, pas comme une image cassée.
//
// Ce que ce n'est pas : un logiciel de radiologie. Pas de mesure, pas de
// filtre DICOM — l'image est celle que le logiciel du capteur a exportée.
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDateFr } from '@/lib/utils'
import { jourImage, libelleType, type ImageDentaire } from '@/lib/imagerie'
import { Columns2, ChevronLeft, ChevronRight } from 'lucide-react'

export type ClicheAffichable = ImageDentaire & { url: string | null; appointment_id?: string | null }

export function estPdf(c: { file_type?: string | null; file_name?: string | null }): boolean {
  return c.file_type === 'application/pdf' || /\.pdf$/i.test(c.file_name ?? '')
}

function Legende({ c, seance }: { c: ClicheAffichable; seance?: string | null }) {
  const j = jourImage(c)
  return (
    <p className="text-xs text-gray-600">
      <span className="font-medium text-gray-800">{libelleType(c.type_image)}</span>
      {' · '}{formatDateFr(j.jour)}{j.estime ? ' (date de dépôt)' : ''}
      {(c.dents ?? []).length > 0 && <> · dent{(c.dents ?? []).length > 1 ? 's' : ''} {(c.dents ?? []).join(', ')}</>}
      {seance && c.appointment_id === seance && <span className="text-primary-600"> · cette séance</span>}
    </p>
  )
}

function Vue({ c }: { c: ClicheAffichable }) {
  if (!c.url) return <div className="h-64 flex items-center justify-center text-sm text-gray-400">Image indisponible</div>
  if (estPdf(c)) return <iframe src={c.url} title={c.file_name} className="w-full h-[70vh] rounded-lg bg-gray-50" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={c.url} alt={`${libelleType(c.type_image)} ${(c.dents ?? []).join(', ')}`} className="w-full max-h-[70vh] object-contain rounded-lg bg-black" />
}

export default function VisionneuseCliches({ cliches, index, onFermer, seance = null }: {
  /** Du plus récent au plus ancien. */
  cliches: ClicheAffichable[]
  index: number | null
  onFermer: () => void
  seance?: string | null
}) {
  const [courant, setCourant] = useState<number | null>(index)
  const [compare, setCompare] = useState(false)
  // Réouverture sur un autre cliché : on repart de celui qu'on a cliqué.
  const [dernierIndex, setDernierIndex] = useState(index)
  if (index !== dernierIndex) { setDernierIndex(index); setCourant(index); setCompare(false) }

  const ouvert = courant !== null && cliches[courant] != null
  const c = ouvert ? cliches[courant!] : null
  // Le cliché précédent DANS LE TEMPS, d'une autre date : comparer deux images
  // du même jour ne montre aucune évolution.
  const anterieur = c
    ? cliches.slice(courant! + 1).find((x) => jourImage(x).jour !== jourImage(c).jour && !estPdf(x)) ?? null
    : null

  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o) onFermer() }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{c ? libelleType(c.type_image) : 'Cliché'}</DialogTitle>
        </DialogHeader>
        {c && (compare && anterieur ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Vue c={anterieur} /><Legende c={anterieur} seance={seance} /></div>
            <div className="space-y-1.5"><Vue c={c} /><Legende c={c} seance={seance} /></div>
          </div>
        ) : (
          <div className="space-y-2">
            <Vue c={c} />
            <Legende c={c} seance={seance} />
          </div>
        ))}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCourant((i) => (i !== null && i > 0 ? i - 1 : i))}
            disabled={!c || courant === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Plus récent
          </button>
          <button
            type="button"
            onClick={() => setCourant((i) => (i !== null && i < cliches.length - 1 ? i + 1 : i))}
            disabled={!c || courant === cliches.length - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-40"
          >
            Plus ancien <ChevronRight className="h-4 w-4" />
          </button>
          {anterieur && (
            <button
              type="button"
              onClick={() => setCompare((x) => !x)}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${compare ? 'bg-primary-500 text-white' : 'border border-primary-200 text-primary-700'}`}
            >
              <Columns2 className="h-4 w-4" /> {compare ? 'Un seul cliché' : `Comparer avec le ${formatDateFr(jourImage(anterieur).jour)}`}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
