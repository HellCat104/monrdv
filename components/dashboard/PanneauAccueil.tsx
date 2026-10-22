'use client'

// Tout ce qui passe entre le médecin et l'accueil, pour UN patient, à UN seul
// endroit.
//
// Pourquoi un panneau plutôt que des entrées dans le menu « … » : ce menu
// parle du RENDEZ-VOUS (le déplacer, l'annuler, pointer une absence). Y
// glisser « faites entrer le suivant » et « répondre à l'accueil » en aurait
// fait une liste de huit lignes mélangeant quatre sujets, qu'il faut relire en
// entier à chaque fois.
//
// La règle des écrans est donc : à côté du nom on LIT, au bout de la ligne on
// PARLE, dans le menu « … » on gère le rendez-vous.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MessageSquare, BellRing, CalendarClock, Check } from 'lucide-react'

export interface Mot {
  id: string
  auteur: string
  auteur_nom?: string | null
  contenu: string
  created_at: string
}

const DELAIS: readonly (readonly [string, number])[] = [
  ['1 sem.', 7], ['2 sem.', 14], ['1 mois', 30], ['3 mois', 90], ['6 mois', 180],
]

export default function PanneauAccueil({
  appointmentId, doctorId, patientNom, mots: motsInitiaux = [], reprogrammerJours = null, onChange,
}: {
  appointmentId: string
  doctorId: string
  patientNom: string
  mots?: Mot[]
  reprogrammerJours?: number | null
  onChange?: () => void
}) {
  const supabase = createClient()
  const [ouvert, setOuvert] = useState(false)
  const [mots, setMots] = useState<Mot[]>(motsInitiaux)
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [reprog, setReprog] = useState<number | null>(reprogrammerJours)
  const [appelEnvoye, setAppelEnvoye] = useState(false)
  const [erreur, setErreur] = useState('')

  // Une seule pastille sur le bouton : « il y a quelque chose », pas un
  // décompte. Un chiffre inviterait à le suivre, alors que rien ici ne
  // distingue un mot lu d'un mot non lu — et prétendre le contraire serait
  // pire que de ne rien promettre.
  const enAttente = mots.length > 0 || reprog != null

  async function envoyer() {
    const contenu = texte.trim()
    if (!contenu) return
    setEnvoi(true)
    setErreur('')
    const { data, error } = await supabase
      .from('appointment_messages')
      .insert({ doctor_id: doctorId, appointment_id: appointmentId, auteur: 'medecin', contenu })
      .select('id, auteur, auteur_nom, contenu, created_at')
      .single()
    setEnvoi(false)
    if (error || !data) { setErreur("Le mot n'a pas pu être envoyé."); return }
    setMots((prev) => [...prev, data as Mot])
    setTexte('')
    onChange?.()
  }

  async function appelerSuivant() {
    const { error } = await supabase
      .from('appointments')
      .update({ appel_suivant_le: new Date().toISOString() })
      .eq('id', appointmentId)
    if (error) { setErreur("L'appel n'a pas pu être envoyé."); return }
    setAppelEnvoye(true)
    setTimeout(() => setAppelEnvoye(false), 60000)
    onChange?.()
  }

  async function demanderReprogrammation(jours: number | null) {
    const { error } = await supabase
      .from('appointments')
      .update({ reprogrammer_jours: jours })
      .eq('id', appointmentId)
    if (error) { setErreur("La consigne n'a pas pu être transmise."); return }
    setReprog(jours)
    onChange?.()
  }

  return (
    <>
      <button
        onClick={() => { setOuvert(true); setErreur('') }}
        title="Échanger avec l'accueil"
        className={`relative flex items-center gap-1 text-xs rounded-lg px-2 py-1 border transition-colors ${
          enAttente
            ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100'
            : 'border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-700'
        }`}
      >
        <MessageSquare className="h-3.5 w-3.5" /> Accueil
        {enAttente && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-violet-500" />}
      </button>

      <Dialog open={ouvert} onOpenChange={(o) => { if (!o) { setOuvert(false); setErreur('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-violet-600" /> Accueil — {patientNom}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* ── Ce qu'on se dit ─────────────────────────────────────── */}
            {mots.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {mots.map((m) => (
                  <div key={m.id} className={`rounded-lg px-3 py-2 text-sm border ${m.auteur === 'medecin' ? 'bg-violet-50 border-violet-100' : 'bg-gray-50 border-gray-100'}`}>
                    <p className="text-[11px] text-gray-500 mb-0.5">
                      {m.auteur === 'medecin' ? 'Vous' : (m.auteur_nom || 'Accueil')} · {String(m.created_at).slice(11, 16)}
                    </p>
                    <p className="text-gray-800 whitespace-pre-wrap">{m.contenu}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-1.5">
              <Input
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); envoyer() } }}
                placeholder={mots.length > 0 ? 'Répondre…' : 'Un mot à l’accueil…'}
                maxLength={1000}
                className="text-sm h-9"
              />
              <Button size="sm" className="h-9 shrink-0" onClick={envoyer} disabled={envoi || !texte.trim()}>
                {envoi ? '…' : 'Envoyer'}
              </Button>
            </div>

            {/* ── Ce qu'on demande ────────────────────────────────────── */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Demander à l&apos;accueil</p>

              <button
                onClick={appelerSuivant}
                disabled={appelEnvoye}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  appelEnvoye ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                }`}
              >
                {appelEnvoye
                  ? <><Check className="h-4 w-4" /> L&apos;accueil est prévenu</>
                  : <><BellRing className="h-4 w-4 text-primary-500" /> Faites entrer le suivant</>}
              </button>

              {reprog != null ? (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
                  <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="flex-1">
                    À revoir dans <strong>{reprog} jours</strong>.
                    <button onClick={() => demanderReprogrammation(null)} className="block text-[11px] underline hover:no-underline mt-0.5">
                      Retirer la consigne
                    </button>
                  </span>
                </div>
              ) : (
                <div className="px-3 py-2 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1.5">Le reprogrammer dans…</p>
                  <div className="flex flex-wrap gap-1">
                    {DELAIS.map(([label, n]) => (
                      <button key={n} onClick={() => demanderReprogrammation(n)}
                        className="text-[11px] px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:border-amber-400">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {erreur && <p role="alert" className="text-xs text-red-600">{erreur}</p>}

            {/* Dire ce que ça n'est pas, une fois, au bon endroit : sans ça on
                croit qu'un écran sonne quelque part. */}
            <p className="text-[11px] text-gray-400">
              L&apos;accueil le verra sur son agenda et dans sa salle d&apos;attente. Ce n&apos;est pas une alerte.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
