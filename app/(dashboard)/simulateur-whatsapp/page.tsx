'use client'

// Simulateur du chatbot WhatsApp.
//
// Il appelle la MÊME machine à états que le futur webhook Meta : ce qui
// s'affiche ici est mot pour mot ce que le patient lira sur WhatsApp. C'est ce
// qui permet de juger et corriger tout le parcours — textes, ordre des étapes,
// créneaux proposés — AVANT que le compte Meta soit vérifié, alors que cette
// vérification est le chemin critique du projet.
//
// Les boutons et les lignes de liste sont rendus à plat, et non derrière le
// menu déroulant de WhatsApp : on teste la logique, pas l'animation. Le nombre
// de lignes et la longueur des titres respectent en revanche les plafonds
// réels de Meta (3 boutons, 10 lignes, 24 caractères), sinon le simulateur
// validerait des écrans que WhatsApp tronquerait.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface Bouton { id: string; titre: string }
interface Ligne { id: string; titre: string; description?: string }
type Sortie =
  | { type: 'texte'; texte: string }
  | { type: 'boutons'; texte: string; boutons: Bouton[] }
  | { type: 'liste'; texte: string; bouton: string; lignes: Ligne[] }

interface Bulle {
  sens: 'entrant' | 'sortant'
  texte: string
  actions?: { id: string; titre: string; description?: string }[]
  libelleListe?: string
}

const NUMERO_PAR_DEFAUT = '0612345678'

export default function SimulateurWhatsApp() {
  const [numero, setNumero] = useState(NUMERO_PAR_DEFAUT)
  const [bulles, setBulles] = useState<Bulle[]>([])
  const [saisie, setSaisie] = useState('')
  const [etape, setEtape] = useState<string>('—')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  // Slug du médecin connecté : c'est SON lien wa.me qu'on imite. Écrit en dur,
  // il ne correspondait à aucun médecin et le parcours « arrivée par lien »
  // retombait silencieusement sur « praticien inconnu ».
  const [medecin, setMedecin] = useState<{ slug: string; nom: string } | null>(null)

  useEffect(() => {
    fetch('/api/whatsapp/simulateur')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.slug && setMedecin({ slug: d.slug, nom: d.nom }))
      .catch(() => {})
  }, [])

  async function envoyer(payload: { texte?: string; choix?: string }, libelleAffiche: string) {
    setEnCours(true)
    setErreur(null)
    setBulles((b) => [...b, { sens: 'entrant', texte: libelleAffiche }])

    try {
      const r = await fetch('/api/whatsapp/simulateur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waId: numero, ...payload }),
      })
      const data = await r.json()

      if (!r.ok) {
        setErreur([data.error ?? 'Erreur inconnue', data.pile].filter(Boolean).join('\n'))
        return
      }

      setEtape(data.etape ?? '—')
      const nouvelles: Bulle[] = (data.sorties as Sortie[]).map((s) => {
        if (s.type === 'boutons') {
          return { sens: 'sortant', texte: s.texte, actions: s.boutons }
        }
        if (s.type === 'liste') {
          return { sens: 'sortant', texte: s.texte, actions: s.lignes, libelleListe: s.bouton }
        }
        return { sens: 'sortant', texte: s.texte }
      })

      // Une conversation escaladée ne reçoit plus rien du bot : c'est volontaire,
      // mais il faut que ça se voie dans le simulateur.
      setBulles((b) => [
        ...b,
        ...(nouvelles.length === 0
          ? [{ sens: 'sortant' as const, texte: '(le bot se tait — un humain a la main)' }]
          : nouvelles),
      ])
    } catch {
      setErreur('Le simulateur n’a pas répondu.')
    } finally {
      setEnCours(false)
    }
  }

  async function reinitialiser() {
    setEnCours(true)
    await fetch(`/api/whatsapp/simulateur?waId=${encodeURIComponent(numero)}`, { method: 'DELETE' })
    setBulles([])
    setEtape('—')
    setErreur(null)
    setEnCours(false)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Simulateur WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le parcours réel du patient, sans WhatsApp. Les rendez-vous créés ici sont
          de vrais rendez-vous : utilisez un compte de démonstration.
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Numéro du patient
            </label>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="0612345678"
            />
          </div>
          <Button variant="outline" onClick={reinitialiser} disabled={enCours}>
            Réinitialiser
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Button
            size="sm"
            variant="secondary"
            disabled={enCours}
            onClick={() => envoyer({ texte: 'bonjour' }, 'bonjour')}
          >
            « bonjour »
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={enCours || !medecin}
            title={medecin ? `Imite le lien wa.me de ${medecin.nom}` : 'Chargement du praticien…'}
            onClick={() =>
              medecin &&
              envoyer({ texte: `RDV dr-${medecin.slug}` }, `RDV dr-${medecin.slug} (lien wa.me)`)
            }
          >
            Arrivée par lien
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={enCours}
            onClick={() => envoyer({ texte: 'jai tres mal je saigne' }, 'jai tres mal je saigne')}
          >
            Tester l&apos;urgence
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Étape courante : <code className="rounded bg-muted px-1">{etape}</code>
        </p>
      </Card>

      {erreur && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <pre className="whitespace-pre-wrap break-words font-sans">{erreur}</pre>
        </Card>
      )}

      <Card className="min-h-[300px] space-y-3 bg-[#ECE5DD] p-4 dark:bg-muted">
        {bulles.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Envoyez un premier message pour démarrer la conversation.
          </p>
        )}

        {bulles.map((bulle, i) => (
          <div
            key={i}
            className={bulle.sens === 'entrant' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                bulle.sens === 'entrant'
                  ? 'bg-[#DCF8C6] text-neutral-900'
                  : 'bg-white text-neutral-900'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{bulle.texte}</p>

              {bulle.libelleListe && (
                <p className="mt-2 border-t pt-2 text-xs font-medium text-neutral-500">
                  ▾ {bulle.libelleListe}
                </p>
              )}

              {bulle.actions && (
                <div className="mt-2 flex flex-col gap-1">
                  {bulle.actions.map((a) => (
                    <button
                      key={a.id}
                      disabled={enCours}
                      onClick={() => envoyer({ choix: a.id }, a.titre)}
                      className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left text-sm text-[#075E54] hover:bg-neutral-100 disabled:opacity-50"
                    >
                      <span className="font-medium">{a.titre}</span>
                      {a.description && (
                        <span className="block text-xs text-neutral-500">{a.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const t = saisie.trim()
          if (!t) return
          setSaisie('')
          envoyer({ texte: t }, t)
        }}
      >
        <Input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Écrire un message…"
          disabled={enCours}
        />
        <Button type="submit" disabled={enCours || !saisie.trim()}>
          Envoyer
        </Button>
      </form>
    </div>
  )
}
