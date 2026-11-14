'use client'

// « Avant de terminer » — ce qui est enregistré pour cette séance.
//
// Une vérification, pas un barrage. On relit en base ce que la séance a
// laissé — consultation, diagnostic, actes, dents, ordonnances, clichés — et
// on le montre. Ce qui manque peut-être est signalé en orange ; le praticien
// termine quand même s'il le juge bon. Une consultation de contrôle sans
// diagnostic ni acte est une consultation normale.
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { PointCloture } from '@/lib/espace-dentaire'

export default function AvantDeTerminer({ rdvId, ouvert, onAnnuler, onTerminer, enCours }: {
  rdvId: string
  ouvert: boolean
  onAnnuler: () => void
  onTerminer: () => void
  enCours: boolean
}) {
  const [points, setPoints] = useState<PointCloture[] | null>(null)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    if (!ouvert) return
    let vivant = true
    setPoints(null); setErreur(false)
    fetch(`/api/dentaire/cloture?rdv=${rdvId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (vivant) setPoints(d.points ?? []) })
      .catch(() => { if (vivant) setErreur(true) })
    return () => { vivant = false }
  }, [ouvert, rdvId])

  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o && !enCours) onAnnuler() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Terminer la consultation</DialogTitle>
        </DialogHeader>
        {erreur ? (
          <p className="text-sm text-gray-500">La vérification n&apos;a pas pu se faire. Vous pouvez terminer quand même.</p>
        ) : points === null ? (
          <p className="text-sm text-gray-400">Vérification de la séance…</p>
        ) : (
          <ul className="space-y-1.5">
            {points.map((p, i) => (
              <li key={i} className={`flex items-start gap-2 text-sm ${p.niveau === 'ok' ? 'text-gray-700' : 'text-amber-800'}`}>
                {p.niveau === 'ok'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                {p.texte}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-500">
          Vous reviendrez au dossier du patient, avec cette visite en tête de l&apos;historique.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onAnnuler} disabled={enCours}>Revenir à la séance</Button>
          <Button onClick={onTerminer} disabled={enCours} autoFocus>
            {enCours ? 'Clôture…' : 'Terminer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
