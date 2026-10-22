'use client'

// Le pendant exact de PanneauAccueil, côté poste d'accueil : tout ce qui passe
// entre elle et le médecin pour UN patient, à un seul endroit.
//
// Présent sur ses DEUX écrans — l'agenda et la salle d'attente — parce qu'elle
// travaille surtout depuis la seconde. L'avoir laissé sur le seul agenda
// l'aurait obligée à changer d'écran pour répondre, ce qui est précisément la
// coupure qu'on cherche à supprimer.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MessageSquare, CalendarClock } from 'lucide-react'

export interface Mot {
  id: string
  auteur: string
  auteur_nom?: string | null
  contenu: string
  created_at: string
}

export interface RdvEchange {
  id: string
  patient?: { first_name?: string; last_name?: string } | null
  mots?: Mot[] | null
  reprogrammer_jours?: number | null
}

/** Le bouton de ligne. La pastille dit « il y a quelque chose » — pas un
 *  décompte : rien n'enregistre le lu et le non lu, et un chiffre aurait
 *  promis une mécanique qui n'existe pas. */
export function BoutonMedecin({ rdv, onOpen }: { rdv: RdvEchange; onOpen: () => void }) {
  const enAttente = (rdv.mots?.length ?? 0) > 0 || rdv.reprogrammer_jours != null
  return (
    <button
      onClick={onOpen}
      title="Échanger avec le médecin"
      className={`relative flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-colors whitespace-nowrap ${
        enAttente
          ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100'
          : 'border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-700'
      }`}
    >
      <MessageSquare className="h-3.5 w-3.5" /> Médecin
      {enAttente && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-violet-500" />}
    </button>
  )
}

export default function PanneauMedecin({
  rdv, doctorName, onClose, onChange,
}: {
  /** null = fermé. */
  rdv: RdvEchange | null
  doctorName: string
  onClose: () => void
  /** Rechargement de l'écran appelant, pour que la ligne suive. */
  onChange?: () => void
}) {
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  // Copie locale du fil : il grandit pendant que la fenêtre est ouverte.
  const [mots, setMots] = useState<Mot[]>(rdv?.mots ?? [])
  const [reprog, setReprog] = useState<number | null>(rdv?.reprogrammer_jours ?? null)
  const [cleOuverture, setCleOuverture] = useState<string | null>(null)

  // Réinitialise à chaque patient, sans useEffect : le rendu suffit.
  if (rdv && cleOuverture !== rdv.id) {
    setCleOuverture(rdv.id)
    setMots(rdv.mots ?? [])
    setReprog(rdv.reprogrammer_jours ?? null)
    setTexte('')
    setErreur('')
  }

  async function envoyer() {
    const contenu = texte.trim()
    if (!rdv || !contenu) return
    setEnvoi(true)
    setErreur('')
    try {
      const res = await fetch('/api/cabinet/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: rdv.id, contenu }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur(d.error || 'Envoi impossible.'); return }
      setMots((prev) => [...prev, d.message])
      setTexte('')
      onChange?.()
    } catch {
      setErreur('Erreur réseau.')
    } finally {
      setEnvoi(false)
    }
  }

  async function soldeConsigne() {
    if (!rdv) return
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rdv.id, reprogrammer_jours: null }),
    })
    if (!res.ok) { setErreur("La consigne n'a pas pu être soldée."); return }
    setReprog(null)
    onChange?.()
  }

  const nom = rdv?.patient ? `${rdv.patient.first_name ?? ''} ${rdv.patient.last_name ?? ''}`.trim() : ''

  return (
    <Dialog open={!!rdv} onOpenChange={(o) => { if (!o) { onClose(); setErreur('') } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-violet-600" /> Médecin — {nom}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ce que le médecin demande, et le geste pour le solder — ici, et
              plus sur une pastille à côté du nom : une pastille qui se clique
              à côté d'une pastille qui s'affiche, personne ne sait laquelle
              est laquelle. */}
          {reprog != null && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
              <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="flex-1">Le médecin demande de le revoir dans <strong>{reprog} jours</strong>.</span>
              <button onClick={soldeConsigne} className="text-xs font-semibold bg-amber-200/70 hover:bg-amber-200 rounded-lg px-2 py-1 shrink-0">
                C&apos;est fait
              </button>
            </div>
          )}

          {mots.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {mots.map((m) => (
                <div key={m.id} className={`rounded-lg px-3 py-2 text-sm border ${m.auteur === 'medecin' ? 'bg-primary-50 border-primary-100' : 'bg-gray-50 border-gray-100'}`}>
                  <p className="text-[11px] text-gray-500 mb-0.5">
                    {m.auteur === 'medecin' ? doctorName : (m.auteur_nom || 'Accueil')} · {String(m.created_at).slice(11, 16)}
                  </p>
                  <p className="text-gray-800 whitespace-pre-wrap">{m.contenu}</p>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Elle demande si elle peut décaler à jeudi…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          {erreur && <p role="alert" className="text-xs text-red-600">{erreur}</p>}

          {/* Dire ce que ça n'est pas, une fois : sans ça on croit qu'un écran
              sonne quelque part. */}
          <p className="text-[11px] text-gray-400">
            Le médecin le verra sur son agenda et dans la consultation du patient. Ce n&apos;est pas une alerte : pour une urgence, allez le voir.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { onClose(); setErreur('') }} className="flex-1">Fermer</Button>
            <Button onClick={envoyer} disabled={envoi || !texte.trim()} className="flex-1">
              {envoi ? 'Envoi…' : 'Envoyer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
