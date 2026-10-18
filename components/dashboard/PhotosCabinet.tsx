'use client'

// Photos du cabinet (v74) — carte autonome de l'écran Paramètres.
//
// Même parti pris que LogoCabinet : elle charge et enregistre elle-même par
// /api/doctors/photos, ne dépend d'aucun état de la page qui l'accueille, et
// n'affiche une photo qu'une fois que le SERVEUR a confirmé l'avoir
// enregistrée — jamais un aperçu local qui disparaîtrait au rechargement.
//
// Ce qu'elle fait en plus : elle REDIMENSIONNE avant d'envoyer. Un médecin
// choisit ses photos dans la pellicule de son téléphone, où elles pèsent 4 Mo
// pièce ; envoyées telles quelles en 4G, l'attente est longue et un envoi sur
// deux échoue. Réencodées ici, elles font ~300 ko et partent instantanément.
// C'est aussi ce qui permet d'accepter du HEIC d'iPhone sans que le serveur
// ait à le connaître : il n'en sort que du JPEG.
//
// L'ORDRE du tableau est l'ordre d'affichage sur la fiche publique, et la
// première photo est celle qu'on voit en grand. D'où les flèches plutôt qu'un
// glisser-déposer : sur un téléphone, le glisser-déposer se bat avec le
// défilement de la page.

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Camera, Upload, Trash2, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  PHOTO_ACCEPT, PHOTO_CONSIGNE, PHOTOS_MAX, PHOTO_MAX_SIDE, PHOTO_QUALITE,
} from '@/lib/cabinet-photos'
import { redimensionnerEnJpeg } from '@/lib/image-navigateur'

interface Photo { chemin: string; url: string }

export function PhotosCabinet({ className }: { className?: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [disponible, setDisponible] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [progression, setProgression] = useState('')
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/doctors/photos')
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Chargement impossible')
      if (data.migrationAbsente) setDisponible(false)
      setPhotos(data.photos ?? [])
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible')
      setPhotos([])
    }
  }, [])

  useEffect(() => { charger() }, [charger])

  async function ajouter(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? [])
    e.target.value = '' // permet de resélectionner le même fichier après un échec
    if (fichiers.length === 0 || !photos) return

    const place = PHOTOS_MAX - photos.length
    if (place <= 0) { setErreur(`${PHOTOS_MAX} photos au maximum.`); return }

    setErreur('')
    setEnvoi(true)
    // Une par une, et non en parallèle : la route lit le tableau puis le
    // réécrit, donc deux envois simultanés se marcheraient dessus et une
    // photo serait perdue.
    const aTraiter = fichiers.slice(0, place)
    try {
      for (let i = 0; i < aTraiter.length; i++) {
        setProgression(`Photo ${i + 1} sur ${aTraiter.length}…`)
        const reduite = await redimensionnerEnJpeg(aTraiter[i], PHOTO_MAX_SIDE, PHOTO_QUALITE)
        if (!reduite) { setErreur(`« ${aTraiter[i].name} » n'a pas pu être lue.`); continue }

        const corps = new FormData()
        corps.append('fichier', new File([reduite], 'photo.jpg', { type: 'image/jpeg' }))
        const r = await fetch('/api/doctors/photos', { method: 'POST', body: corps })
        const data = await r.json()
        if (!r.ok) { setErreur(data.error ?? 'Envoi impossible'); break }
        setPhotos(data.photos)
      }
      if (fichiers.length > place) {
        setErreur(`Seules ${place} photo${place > 1 ? 's ont' : ' a'} été ajoutée${place > 1 ? 's' : ''} : ${PHOTOS_MAX} au maximum.`)
      }
    } finally {
      setEnvoi(false)
      setProgression('')
    }
  }

  async function supprimer(chemin: string) {
    setErreur('')
    setEnvoi(true)
    try {
      const r = await fetch(`/api/doctors/photos?chemin=${encodeURIComponent(chemin)}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Suppression impossible')
      setPhotos(data.photos)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible')
    } finally { setEnvoi(false) }
  }

  async function deplacer(index: number, sens: -1 | 1) {
    if (!photos) return
    const cible = index + sens
    if (cible < 0 || cible >= photos.length) return

    const suite = [...photos]
    ;[suite[index], suite[cible]] = [suite[cible], suite[index]]
    setPhotos(suite) // retour visuel immédiat : un déplacement doit se voir

    try {
      const r = await fetch('/api/doctors/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: suite.map((p) => p.chemin) }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Réorganisation impossible')
      setPhotos(data.photos)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Réorganisation impossible')
      charger() // le serveur fait foi : on remet l'ordre réel
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary-500" />
          Photos du cabinet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">
          Elles s&apos;affichent sur votre page de réservation, quand un patient consulte
          votre profil. La façade, la salle d&apos;attente, le fauteuil : c&apos;est ce qui
          rassure avant un premier rendez-vous.
        </p>

        {!disponible && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            Cette fonction n&apos;est pas encore activée sur le serveur.
          </p>
        )}

        {photos === null ? (
          <p className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </p>
        ) : (
          <>
            {photos.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p, i) => (
                  <li key={p.chemin} className="group relative overflow-hidden rounded-xl border border-gray-200">
                    <div className="relative aspect-[4/3] bg-gray-50">
                      <Image
                        src={p.url}
                        alt={`Photo ${i + 1} du cabinet`}
                        fill
                        sizes="(max-width: 640px) 50vw, 200px"
                        className="object-cover"
                      />
                    </div>
                    {i === 0 && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-primary-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Mise en avant
                      </span>
                    )}
                    <div className="flex items-center justify-between border-t border-gray-100 bg-white px-1 py-1">
                      <div className="flex">
                        <button
                          type="button" aria-label="Déplacer vers la gauche"
                          onClick={() => deplacer(i, -1)} disabled={envoi || i === 0}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        ><ChevronLeft className="h-4 w-4" /></button>
                        <button
                          type="button" aria-label="Déplacer vers la droite"
                          onClick={() => deplacer(i, 1)} disabled={envoi || i === photos.length - 1}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        ><ChevronRight className="h-4 w-4" /></button>
                      </div>
                      <button
                        type="button" aria-label={`Supprimer la photo ${i + 1}`}
                        onClick={() => supprimer(p.chemin)} disabled={envoi}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      ><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {photos.length < PHOTOS_MAX && disponible && (
              <label className="cursor-pointer">
                <input
                  type="file" accept={PHOTO_ACCEPT} multiple className="hidden"
                  onChange={ajouter} disabled={envoi}
                />
                <span className={`inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium transition-colors
                  ${envoi ? 'cursor-not-allowed bg-gray-50 opacity-50' : 'cursor-pointer bg-white hover:bg-gray-50'}`}>
                  {envoi
                    ? <><Loader2 className="h-4 w-4 animate-spin text-gray-500" /> {progression || 'Envoi…'}</>
                    : <><Upload className="h-4 w-4 text-gray-500" /> Ajouter des photos</>}
                </span>
              </label>
            )}

            <p className="text-xs text-gray-400">{PHOTO_CONSIGNE}</p>
          </>
        )}

        {erreur && (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {erreur}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
