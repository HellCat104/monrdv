'use client'

// Encart « Rappels de suivi » du tableau de bord.
//
// Un « revoir dans 6 mois » programmé en janvier n'existait que dans la fiche
// de CE patient : en juillet, personne ne le relisait. Cet encart est le seul
// endroit où la question « qui dois-je rappeler ? » se pose sans ouvrir trente
// fiches.
//
// Même règle que SuiviLabo : s'il n'y a rien à faire, l'encart N'EXISTE PAS.
// Une carte « Aucun rappel » apprend au médecin à ne plus regarder cette zone
// de l'écran, et le jour où elle a quelque chose à dire il ne la voit plus.
//
// On affiche le MOTIF et le TÉLÉPHONE, pas un lien « voir la fiche » : le geste
// attendu est de décrocher, et un numéro qu'il faut aller chercher dans un
// autre écran ne se compose jamais.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import { BellRing, Phone, Check } from 'lucide-react'

type Rappel = {
  id: string
  due_date: string
  reason: string | null
  // `a_rappeler` (v71) n'est pas dans RecallStatus (types/index.ts), qui décrit
  // l'état de la base d'avant la migration. Type local plutôt que modification
  // d'un type partagé : tant que la v71 n'est pas passée, la valeur n'arrive
  // tout simplement jamais.
  status: 'pending' | 'a_rappeler'
  patient?: { id?: string; first_name?: string; last_name?: string; phone?: string | null } | null
}

export default function RappelsDus() {
  const [rappels, setRappels] = useState<Rappel[]>([])
  const aujourdhui = getNowInMaroc().toISOString().slice(0, 10)

  useEffect(() => {
    fetch('/api/recalls')
      .then((r) => (r.ok ? r.json() : { rappels: [] }))
      .then((d) => setRappels(d.rappels ?? []))
      .catch(() => { /* table absente ou erreur : l'encart n'existe pas */ })
  }, [])

  // Marque traité et retire la ligne sans attendre la réponse : le médecin a
  // le téléphone à l'oreille, l'encart doit déjà refléter ce qu'il reste à
  // faire. En cas d'échec la ligne revient au prochain chargement — la base
  // reste la référence, l'écran n'invente rien.
  const traiter = async (id: string) => {
    setRappels((liste) => liste.filter((r) => r.id !== id))
    await fetch('/api/recalls', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => { /* la ligne réapparaîtra au prochain chargement */ })
  }

  // Deux urgences différentes, pas deux nuances de la même : « à appeler » =
  // le patient n'a pas d'e-mail, donc AUCUN message ne partira jamais, c'est
  // au cabinet d'agir. Les autres ont reçu (ou vont recevoir) leur e-mail
  // automatique : on les montre parce que l'échéance approche, pas parce
  // qu'il y a une défaillance à rattraper.
  const aAppeler = rappels.filter((r) => r.status === 'a_rappeler')
  const dus = rappels.filter((r) => r.status !== 'a_rappeler')
  if (aAppeler.length === 0 && dus.length === 0) return null

  const Ligne = ({ r, alerte }: { r: Rappel; alerte: boolean }) => {
    const nom = `${r.patient?.first_name ?? ''} ${r.patient?.last_name ?? ''}`.trim()
    const tel = r.patient?.phone?.trim()
    const enRetard = r.due_date <= aujourdhui
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm px-1 rounded hover:bg-gray-50">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${alerte ? 'bg-red-500' : 'bg-amber-400'}`} />
        {r.patient?.id ? (
          <Link href={`/patients/${r.patient.id}`} className="font-medium text-gray-800 truncate hover:underline">
            {nom || 'Patient'}
          </Link>
        ) : (
          <span className="font-medium text-gray-800 truncate">{nom || 'Patient'}</span>
        )}
        {r.reason && <span className="text-gray-400 truncate">{r.reason}</span>}
        <span className={`ml-auto shrink-0 tabular-nums ${enRetard ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {formatDateShort(r.due_date)}
        </span>
        {/* `tel:` et non un simple texte : sur le portable du médecin, le
            numéro se compose d'un geste. Sans numéro on n'affiche pas un
            bouton mort — le nom reste cliquable pour aller le chercher. */}
        {tel && (
          <a
            href={`tel:${tel.replace(/\s/g, '')}`}
            className="shrink-0 flex items-center gap-1 tabular-nums text-primary-600 hover:underline"
          >
            <Phone className="h-3.5 w-3.5" /> {tel}
          </a>
        )}
        <button
          onClick={() => traiter(r.id)}
          title="Marquer traité"
          className="shrink-0 text-gray-300 hover:text-green-600"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary-500" /> Rappels de suivi
          {aAppeler.length > 0 && (
            <span className="text-xs font-semibold text-red-600">
              {aAppeler.length} à appeler
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {aAppeler.map((r) => <Ligne key={r.id} r={r} alerte />)}
        {dus.map((r) => <Ligne key={r.id} r={r} alerte={false} />)}
        <p className="text-[11px] text-gray-400 mt-2">
          {aAppeler.length > 0
            ? 'En rouge : sans e-mail, ce patient ne sera prévenu que par vous.'
            : 'Échéances de cette semaine. ✓ une fois le patient joint.'}
        </p>
      </CardContent>
    </Card>
  )
}
