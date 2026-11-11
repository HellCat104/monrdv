'use client'

// Encart « Laboratoire » du tableau de bord.
//
// Il ne s'affiche QUE s'il y a quelque chose à voir : un travail en retard, ou
// attendu dans les sept jours. Un cabinet sans travail en cours ne doit pas
// porter une carte vide — c'est précisément ce qui fait qu'on finit par ne
// plus regarder l'écran.
//
// ── ON RÉPOND LÀ OÙ LA QUESTION EST POSÉE ───────────────────────────────────
//
// L'encart annonçait « 1 en retard » et ne savait rien faire d'autre. Pour
// dire qu'une couronne était arrivée, il fallait ouvrir le dossier du
// patient, déplier « Orthodontie, parodonte, laboratoire », trouver le
// travail et changer son statut : quatre gestes pour une information d'un
// mot, que la secrétaire a en main au moment où elle ouvre le colis. Le
// bouton est donc ici, sur la ligne qui pose la question.
//
// Le reste du parcours — posé, reparti au labo, coût, bon de travail — vit
// toujours dans le dossier : c'est là qu'on le regarde la dent sous les yeux.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import { enRetard, attenduBientot, titreTravail, type LabWork } from '@/lib/labo'
import { FlaskConical, PackageCheck } from 'lucide-react'

type Travail = LabWork & { patient?: { first_name?: string; last_name?: string } | null }

export default function SuiviLabo() {
  const [travaux, setTravaux] = useState<Travail[]>([])
  /** Le travail qu'on est en train de marquer reçu — pour ne pas cliquer deux
   *  fois, et pour que le bouton dise ce qu'il fait. */
  const [enCours, setEnCours] = useState<string | null>(null)
  const aujourdhui = getNowInMaroc().toISOString().slice(0, 10)

  useEffect(() => {
    fetch('/api/lab-works?suivi=1')
      .then((r) => (r.ok ? r.json() : { travaux: [] }))
      .then((d) => setTravaux(d.travaux ?? []))
      .catch(() => { /* ni table ni forfait : l'encart n'existe pas */ })
  }, [])

  /** « C'est revenu ». La date de réception est posée par le serveur : c'est
   *  le jour du geste, et le praticien peut la corriger dans le dossier si le
   *  colis dormait depuis la veille. */
  async function marquerRecu(t: Travail) {
    setEnCours(t.id)
    try {
      const res = await fetch(`/api/lab-works/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'recu' }),
      })
      // On ne retire la ligne que si le serveur a dit oui. Une ligne qui
      // disparaît sur un échec ferait croire le travail rentré.
      if (res.ok) setTravaux((prev) => prev.filter((x) => x.id !== t.id))
      else alert("Le travail n'a pas pu être marqué revenu. Réessayez, ou ouvrez le dossier du patient.")
    } catch {
      alert("Le travail n'a pas pu être marqué revenu. Vérifiez la connexion.")
    } finally {
      setEnCours(null)
    }
  }

  const retard = travaux.filter((t) => enRetard(t, aujourdhui))
  const bientot = travaux.filter((t) => attenduBientot(t, aujourdhui, 7))
  if (retard.length === 0 && bientot.length === 0) return null

  const Ligne = ({ t, alerte }: { t: Travail; alerte: boolean }) => {
    const nom = `${t.patient?.first_name ?? ''} ${t.patient?.last_name ?? ''}`.trim()
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm px-1 rounded hover:bg-gray-50">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${alerte ? 'bg-red-500' : 'bg-amber-400'}`} />
        {/* Le nom et le travail ouvrent le dossier : c'est là qu'on regarde le
            détail, qu'on rappelle le labo ou qu'on réimprime le bon. */}
        <Link href={`/patients/${t.patient_id}`} className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-medium text-gray-800 truncate">{nom || 'Patient'}</span>
          <span className="text-gray-400 truncate">{titreTravail(t)}</span>
        </Link>
        <span className={`shrink-0 tabular-nums ${alerte ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {t.due_at ? formatDateShort(t.due_at) : ''}
        </span>
        <button
          onClick={() => marquerRecu(t)}
          disabled={enCours === t.id}
          title="Marquer ce travail revenu au cabinet"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1
            text-[11px] text-gray-600 hover:border-green-300 hover:text-green-700 disabled:opacity-60"
        >
          <PackageCheck className="h-3.5 w-3.5" />
          {enCours === t.id ? 'Enregistrement…' : 'C’est revenu'}
        </button>
      </div>
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
          « C&apos;est revenu » enregistre la réception du jour et retire la ligne.
        </p>
      </CardContent>
    </Card>
  )
}
