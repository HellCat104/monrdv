'use client'

// Encart « Conversations WhatsApp à reprendre ».
//
// Le chatbot est une extension de MonRDV, pas un outil à côté : une
// conversation où il a passé la main n'ouvre donc pas un nouvel écran, elle
// devient un élément OUVERT dans celui que le cabinet regarde déjà. Même
// modèle que RappelsDus, et les mêmes règles — qui sont bonnes :
//
//  • s'il n'y a rien à faire, l'encart N'EXISTE PAS. Une carte « aucune
//    conversation » apprend à ne plus regarder cette zone de l'écran, et le
//    jour où elle a quelque chose à dire, on ne la voit plus.
//  • on affiche le NUMÉRO en clair, pas un lien vers un fil de discussion :
//    tant que MonRDV ne sait pas écrire sur WhatsApp, le geste attendu est de
//    décrocher, et un numéro qu'il faut aller chercher ailleurs ne se compose
//    jamais.
//  • on affiche la RAISON, parce qu'elle change l'ordre dans lequel on
//    rappelle : une urgence signalée ne se traite pas comme une question sur
//    les horaires.

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Phone, Check, AlertTriangle } from 'lucide-react'

type Conversation = {
  id: string
  prenom: string | null
  telephone: string
  motif: string
  depuis: string
}

/** Depuis combien de temps cette personne attend. Un patient qui patiente
 *  depuis trois heures n'est pas dans la même situation qu'un autre arrivé il
 *  y a deux minutes, et c'est au cabinet d'en juge. */
function depuisQuand(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.round(heures / 24)
  return jours === 1 ? 'hier' : `il y a ${jours} jours`
}

export default function ConversationsAReprendre() {
  const [liste, setListe] = useState<Conversation[]>([])

  useEffect(() => {
    fetch('/api/whatsapp/escalades')
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setListe(d.conversations ?? []))
      .catch(() => { /* migration absente ou erreur : l'encart n'existe pas */ })
  }, [])

  // Retire la ligne sans attendre la réponse : la personne a le téléphone à
  // l'oreille, l'encart doit déjà montrer ce qu'il RESTE à faire. En cas
  // d'échec la ligne revient au prochain chargement — la base reste la
  // référence, l'écran n'invente rien.
  const traiter = async (id: string) => {
    setListe((l) => l.filter((c) => c.id !== id))
    await fetch('/api/whatsapp/escalades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => { /* la ligne réapparaîtra au prochain chargement */ })
  }

  if (liste.length === 0) return null

  return (
    <Card className="border-sky-200 bg-sky-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-sky-600" />
          Conversations WhatsApp à reprendre
          <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs font-medium text-white">
            {liste.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {liste.map((c) => {
          const urgence = c.motif.startsWith('urgence')
          return (
            <div
              key={c.id}
              className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                urgence ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                  {urgence && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />}
                  {c.prenom ?? 'Numéro inconnu'}
                  <span className="font-normal text-gray-400">· {depuisQuand(c.depuis)}</span>
                </p>
                <a
                  href={`tel:${c.telephone.replace(/\s/g, '')}`}
                  className="mt-0.5 flex items-center gap-1.5 text-sm text-sky-700 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" /> {c.telephone}
                </a>
                <p className={`mt-1 text-xs ${urgence ? 'font-medium text-red-700' : 'text-gray-500'}`}>
                  {c.motif}
                </p>
              </div>
              <button
                type="button"
                onClick={() => traiter(c.id)}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Check className="h-3.5 w-3.5" /> Traité
              </button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
