'use client'

// Encart « Remboursements » du tableau de bord.
//
// Une feuille de soins qui dort dans le logiciel sans jamais être imprimée,
// ou déposée depuis deux mois sans retour, ne se découvre que si quelqu'un va
// la chercher — et personne ne va la chercher. L'encart le dit de lui-même,
// et seulement quand il y a quelque chose à dire : un cabinet dont les
// dossiers avancent ne doit pas porter une carte vide.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  bilanFeuilles, departAttente, joursEcoules, nomPatient, JOURS_SANS_RETOUR,
  type FeuilleSuivi,
} from '@/lib/feuilles-soins'
import { jourMaroc } from '@/lib/stock'
import { Receipt } from 'lucide-react'

export default function SuiviRemboursements() {
  const [feuilles, setFeuilles] = useState<FeuilleSuivi[]>([])
  const aujourdhui = jourMaroc(getNowInMaroc())

  useEffect(() => {
    fetch('/api/feuilles-soins?suivi=1')
      .then((r) => (r.ok ? r.json() : { feuilles: [] }))
      .then((d) => setFeuilles(d.feuilles ?? []))
      .catch(() => { /* ni table ni forfait : l'encart n'existe pas */ })
  }, [])

  const bilan = bilanFeuilles(feuilles, aujourdhui)
  if (bilan.rien) return null

  // Les dossiers qui s'enlisent d'abord : ce sont eux qu'on perd. Ceux qui
  // n'ont jamais quitté le cabinet ensuite — ils se règlent en imprimant.
  const lignes = [
    ...bilan.souffrance.map((f) => ({ f, rouge: true })),
    ...bilan.aRemettre.map((f) => ({ f, rouge: false })),
  ].slice(0, 5)
  const restants = bilan.souffrance.length + bilan.aRemettre.length - lignes.length

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary-500" /> Remboursements
          {bilan.souffrance.length > 0 && (
            <span className="text-xs font-semibold text-red-600">
              {bilan.souffrance.length} sans retour
            </span>
          )}
          {bilan.aRemettre.length > 0 && (
            <span className="text-xs font-semibold text-amber-700">
              {bilan.aRemettre.length} à remettre
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {lignes.map(({ f, rouge }) => {
          const depart = departAttente(f)
          const jours = joursEcoules(depart.jour, aujourdhui)
          return (
            <Link key={f.id} href="/remboursements"
              className="flex items-center gap-2 py-1.5 text-sm hover:bg-gray-50 rounded px-1">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rouge ? 'bg-red-500' : 'bg-amber-400'}`} />
              <span className="font-medium text-gray-800 truncate">{nomPatient(f)}</span>
              <span className="text-gray-400 text-[11px] truncate">
                {rouge ? `déposé depuis ${depart.estime ? 'au plus tôt ' : ''}${jours} j` : `établie le ${formatDateShort(f.care_date)}`}
              </span>
              <span className={`ml-auto shrink-0 tabular-nums text-[12px] ${rouge ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                {Number(f.total).toLocaleString('fr-FR')} DH
              </span>
            </Link>
          )
        })}
        {restants > 0 && (
          <Link href="/remboursements" className="text-[11px] text-primary-600 hover:underline block mt-1 px-1">
            et {restants} autre{restants > 1 ? 's' : ''}…
          </Link>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          En rouge : déposé depuis plus de {JOURS_SANS_RETOUR} jours sans retour de l’organisme.{' '}
          <Link href="/remboursements" className="text-primary-600 hover:underline">Ouvrir le suivi</Link>
        </p>
      </CardContent>
    </Card>
  )
}
