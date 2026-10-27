'use client'

// L'étagère, vue du comptoir.
//
// Volontairement plus pauvre que l'écran du médecin : pas de prix, pas de
// valeur du stock, pas de fiche à modifier, pas d'archivage. Ce qu'on attend
// d'ici, c'est un compte juste et un signalement — « il ne reste que deux
// boîtes de gants ». Le reste est une décision de cabinet.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Plus, Minus, AlertTriangle, CalendarClock, Search, Check } from 'lucide-react'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  alertesStock, etatArticle, etatPeremption, niveauLigne, ETAT_LABEL, SENS_LABEL,
  jourMaroc, type ArticleStock, type SensMouvement, type NiveauLigne,
} from '@/lib/stock'

const COULEUR: Record<NiveauLigne, string> = {
  rouge:  'text-red-700 bg-red-50 border-red-200',
  orange: 'text-amber-700 bg-amber-50 border-amber-200',
  neutre: 'text-gray-600 bg-white border-gray-200',
}

export default function StockCabinetClient() {
  const [articles, setArticles] = useState<ArticleStock[]>([])
  const [chargement, setChargement] = useState(true)
  const [activee, setActivee] = useState(true)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)

  const aujourdhui = jourMaroc(getNowInMaroc())

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/cabinet/stock')
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErreur(d.error || 'Lecture impossible'); return }
      setActivee(d.activee !== false)
      setArticles(d.articles ?? [])
    } catch {
      setErreur('Le stock n’a pas pu être chargé.')
    } finally { setChargement(false) }
  }, [])
  useEffect(() => { charger() }, [charger])

  const alertes = useMemo(() => alertesStock(articles, aujourdhui), [articles, aujourdhui])

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return articles
    return articles.filter((a) =>
      [a.nom, a.categorie, a.reference].some((v) => (v ?? '').toLowerCase().includes(q)))
  }, [articles, recherche])

  async function bouger(id: string, sens: SensMouvement, quantite: number, motif?: string) {
    setErreur('')
    const r = await fetch(`/api/cabinet/stock/${id}/mouvement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sens, quantite, motif }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(d.error || 'Mouvement impossible'); return false }
    if (d.article) setArticles((xs) => xs.map((a) => (a.id === id ? { ...a, ...d.article } : a)))
    else await charger()
    if (d.avertissement) setErreur(d.avertissement)
    else { setMessage('Compte mis à jour.'); setTimeout(() => setMessage(''), 3000) }
    return true
  }

  if (!activee) {
    return <p className="text-sm text-gray-500">Le stock n’est pas encore activé dans ce cabinet.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Package className="h-5 w-5 text-primary-500" /> Stock
        </h1>
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, référence…"
            className="text-xs rounded-lg border border-gray-200 pl-8 pr-2 py-1.5 w-52" />
        </div>
      </div>

      {!alertes.rien && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> À signaler au médecin
          </p>
          {alertes.aCommander.length > 0 && (
            <p>{alertes.aCommander.length} article{alertes.aCommander.length > 1 ? 's' : ''} au seuil ou épuisé{alertes.aCommander.length > 1 ? 's' : ''}.</p>
          )}
          {alertes.perimes.length > 0 && (
            <p className="text-red-700">{alertes.perimes.length} article{alertes.perimes.length > 1 ? 's' : ''} périmé{alertes.perimes.length > 1 ? 's' : ''} — à sortir du stock.</p>
          )}
        </div>
      )}

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Check className="h-4 w-4" /> {message}
        </p>
      )}

      {chargement ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-gray-500">
          {articles.length === 0
            ? 'Aucun article au stock pour l’instant. C’est le médecin qui crée les références.'
            : 'Aucun article ne correspond à cette recherche.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {visibles.map((a) => (
            <Ligne key={a.id} article={a} aujourdhui={aujourdhui}
              ouvert={ouvert === a.id}
              onBasculer={() => setOuvert(ouvert === a.id ? null : a.id)}
              onBouger={bouger} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Vous tenez le compte : entrées, sorties, inventaires. Les références, les seuils et
        les prix sont réglés par le médecin.
      </p>
    </div>
  )
}

function Ligne({
  article: a, aujourdhui, ouvert, onBasculer, onBouger,
}: {
  article: ArticleStock
  aujourdhui: string
  ouvert: boolean
  onBasculer: () => void
  onBouger: (id: string, sens: SensMouvement, q: number, motif?: string) => Promise<boolean>
}) {
  const etat = etatArticle(a)
  const perim = etatPeremption(a, aujourdhui)
  const [occupe, setOccupe] = useState(false)
  const [sens, setSens] = useState<SensMouvement>('entree')
  const [q, setQ] = useState('')
  const [motif, setMotif] = useState('')

  async function rapide(s: SensMouvement) {
    setOccupe(true)
    await onBouger(a.id, s, 1, s === 'sortie' ? 'Au comptoir' : 'Réassort')
    setOccupe(false)
  }

  return (
    <div className={`border rounded-xl ${COULEUR[niveauLigne(a, aujourdhui)]}`}>
      <div className="flex items-center gap-2 p-2.5 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {a.nom}
            {a.reference && <span className="text-[11px] text-gray-400 font-normal ml-1.5">réf. {a.reference}</span>}
          </p>
          <p className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
            {a.categorie && <span>{a.categorie}</span>}
            {a.seuil_alerte != null && <span>seuil {Number(a.seuil_alerte)} {a.unite}</span>}
            {a.peremption && (
              <span className={perim === 'perime' ? 'text-red-700 font-semibold' : perim === 'proche' ? 'text-amber-700 font-semibold' : ''}>
                <CalendarClock className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                {perim === 'perime' ? 'périmé le ' : 'périme le '}{formatDateShort(a.peremption)}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => rapide('sortie')} disabled={occupe}
            title="Une sortie"
            className="h-7 w-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold tabular-nums min-w-[4.5rem] text-center">
            {Number(a.quantite)} <span className="text-[11px] font-normal text-gray-500">{a.unite}</span>
          </span>
          <button type="button" onClick={() => rapide('entree')} disabled={occupe}
            title="Une entrée — réassort"
            className="h-7 w-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {etat !== 'ok' ? (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
            etat === 'bas' ? 'bg-amber-200 text-amber-900' : 'bg-red-200 text-red-900'}`}>
            {ETAT_LABEL[etat]}
          </span>
        ) : perim === 'perime' ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-red-200 text-red-900">
            Périmé
          </span>
        ) : null}

        <button onClick={onBasculer} className="text-[11px] text-primary-600 hover:text-primary-700 px-1.5 shrink-0">
          Mouvement
        </button>
      </div>

      {ouvert && (
        <div className="border-t border-gray-200 bg-white rounded-b-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['entree', 'sortie', 'inventaire'] as SensMouvement[]).map((s) => (
              <button key={s} type="button" onClick={() => setSens(s)}
                className={`text-xs font-medium rounded-lg px-2.5 py-1.5 border transition ${
                  sens === s ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {SENS_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">
            {sens === 'entree' && 'Une livraison, un réassort : la quantité s’ajoute au stock.'}
            {sens === 'sortie' && 'Consommé, cassé, jeté : la quantité se retire du stock.'}
            {sens === 'inventaire' && `Vous avez compté l’étagère : ce chiffre REMPLACE le stock (actuellement ${Number(a.quantite)} ${a.unite}).`}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="decimal"
              placeholder={sens === 'inventaire' ? 'Quantité comptée' : 'Quantité'}
              className="w-44 text-sm rounded-lg border border-gray-200 px-2 py-1.5" />
            <span className="text-[11px] text-gray-400">{a.unite}</span>
            <input value={motif} onChange={(e) => setMotif(e.target.value)}
              placeholder="Motif (livraison, cassé, périmé…)"
              className="flex-1 min-w-[12rem] text-sm rounded-lg border border-gray-200 px-2 py-1.5" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={occupe}
              onClick={async () => {
                const n = Number(q)
                if (!Number.isFinite(n) || n <= 0) return
                setOccupe(true)
                const ok = await onBouger(a.id, sens, n, motif.trim() || undefined)
                setOccupe(false)
                if (ok) { setQ(''); setMotif(''); onBasculer() }
              }}
              className="text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 disabled:opacity-60">
              {occupe ? 'Enregistrement…' : 'Enregistrer le mouvement'}
            </button>
            <button type="button" onClick={onBasculer} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
          </div>
          {/* Le journal porte votre nom : c'est ce qui permet au médecin de
              demander « qu'est-ce qui s'est passé jeudi ? » à quelqu'un. */}
          <p className="text-[10px] text-gray-400">Votre nom est enregistré avec le mouvement.</p>
        </div>
      )}
    </div>
  )
}
