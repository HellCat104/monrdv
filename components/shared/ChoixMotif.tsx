'use client'

// CHANGER LE MOTIF D'UN RENDEZ-VOUS déjà pris — agenda du dentiste.
//
// Le patient a pris « Contrôle et détartrage » et il arrive avec une dent
// cassée : le motif doit pouvoir changer en un geste, sans annuler et
// reprendre le rendez-vous. Avec huit motifs, ils tiennent tous à l'écran,
// chacun dans la couleur qu'il a sur l'agenda : on touche, c'est enregistré.
// La durée suit le motif ; si elle déborde sur le rendez-vous suivant, le
// serveur refuse et le message le dit.
import { useState } from 'react'
import { couleurMotif } from '@/lib/motifs-couleurs'
import { Check } from 'lucide-react'

export interface MotifChoisissable {
  id: string
  name: string
  couleur?: string | null
  duration_minutes?: number | null
}

export default function ChoixMotif({ motifs, actuel, onChoisir }: {
  motifs: MotifChoisissable[]
  /** L'identifiant du motif actuel du rendez-vous. */
  actuel: string | null | undefined
  /** Enregistre le nouveau motif ; renvoie un message d'erreur, ou null. */
  onChoisir: (id: string) => Promise<string | null>
}) {
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState('')
  if (motifs.length === 0) return null

  async function choisir(id: string) {
    if (id === actuel || enCours) return
    setErreur(''); setEnCours(id)
    const e = await onChoisir(id)
    setEnCours(null)
    if (e) setErreur(e)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-600">Motif du rendez-vous</p>
      <div className="flex flex-wrap gap-1.5">
        {motifs.map((m) => {
          const c = couleurMotif(m.couleur ?? null)
          const choisi = m.id === actuel
          return (
            <button key={m.id} type="button" onClick={() => choisir(m.id)} disabled={!!enCours}
              aria-pressed={choisi}
              title={m.duration_minutes ? `${m.name} · ${m.duration_minutes} min` : m.name}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                choisi
                  ? `${c?.plein ?? 'bg-primary-500 text-white'} ring-2 ring-offset-1 ring-gray-800`
                  : c ? `${c.fond} ${c.texte} border ${c.bord} hover:brightness-95` : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
              } ${enCours === m.id ? 'opacity-60' : ''}`}>
              {choisi && <Check className="h-3.5 w-3.5" />}
              {m.name}
            </button>
          )
        })}
      </div>
      {erreur && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{erreur}</p>}
    </div>
  )
}
