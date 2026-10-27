'use client'

// Encart « Stock » du tableau de bord.
//
// ── POURQUOI IL EST ICI ET PAS SEULEMENT SUR LA PAGE DU STOCK ───────────────
//
// Un stock qu'il faut aller consulter ne sert à rien : personne n'ouvre
// « Stock » le lundi matin pour vérifier qu'il reste des gants. On s'en
// aperçoit au fauteuil, et il est trop tard.
//
// L'encart ne s'affiche QUE s'il y a quelque chose à commander ou une
// péremption qui tombe. Un cabinet dont le stock va bien ne doit pas porter
// une carte vide — c'est exactement ce qui fait qu'on finit par ne plus
// regarder l'écran.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  alertesStock, etatArticle, ETAT_LABEL, jourMaroc,
  type ArticleStock,
} from '@/lib/stock'
import { Package } from 'lucide-react'

export default function BandeauStock() {
  const [articles, setArticles] = useState<ArticleStock[]>([])
  const aujourdhui = jourMaroc(getNowInMaroc())

  useEffect(() => {
    fetch('/api/stock')
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => setArticles(d.articles ?? []))
      .catch(() => { /* ni table ni forfait : l'encart n'existe pas */ })
  }, [])

  const alertes = alertesStock(articles, aujourdhui)
  if (alertes.rien) return null

  // Les périmés d'abord : ils ne se commandent pas, ils se jettent, et un
  // produit périmé dans un meuble est un geste à ne pas faire.
  const lignes = [
    ...alertes.perimes.map((a) => ({ a, rouge: true, droite: `périmé le ${formatDateShort(a.peremption as string)}` })),
    ...alertes.aCommander.map((a) => ({
      a,
      rouge: etatArticle(a) !== 'bas',
      droite: `${Number(a.quantite)} ${a.unite}`,
    })),
    ...alertes.bientotPerimes
      .filter((a) => !alertes.aCommander.some((x) => x.id === a.id))
      .map((a) => ({ a, rouge: false, droite: `périme le ${formatDateShort(a.peremption as string)}` })),
  ].slice(0, 6)

  const restants = alertes.perimes.length + alertes.aCommander.length
    + alertes.bientotPerimes.filter((a) => !alertes.aCommander.some((x) => x.id === a.id)).length
    - lignes.length

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4 text-primary-500" /> Stock
          {alertes.aCommander.length > 0 && (
            <span className="text-xs font-semibold text-amber-700">
              {alertes.aCommander.length} à commander
            </span>
          )}
          {alertes.perimes.length > 0 && (
            <span className="text-xs font-semibold text-red-600">
              {alertes.perimes.length} périmé{alertes.perimes.length > 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {lignes.map(({ a, rouge, droite }) => (
          <Link key={`${a.id}-${droite}`} href="/stock"
            className="flex items-center gap-2 py-1.5 text-sm hover:bg-gray-50 rounded px-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rouge ? 'bg-red-500' : 'bg-amber-400'}`} />
            <span className="font-medium text-gray-800 truncate">{a.nom}</span>
            {etatArticle(a) !== 'ok' && (
              <span className="text-gray-400 text-[11px] truncate">{ETAT_LABEL[etatArticle(a)]}</span>
            )}
            <span className={`ml-auto shrink-0 tabular-nums text-[12px] ${rouge ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
              {droite}
            </span>
          </Link>
        ))}
        {restants > 0 && (
          <Link href="/stock" className="text-[11px] text-primary-600 hover:underline block mt-1 px-1">
            et {restants} autre{restants > 1 ? 's' : ''}…
          </Link>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          Articles au seuil que vous avez fixé, ou dont la péremption approche.{' '}
          <Link href="/stock" className="text-primary-600 hover:underline">Ouvrir le stock</Link>
        </p>
      </CardContent>
    </Card>
  )
}
