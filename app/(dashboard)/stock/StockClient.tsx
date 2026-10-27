'use client'

// L'écran du stock.
//
// ── CE QU'IL DOIT FAIRE EN UN GESTE ─────────────────────────────────────────
//
// Au fauteuil, on prend une cartouche. Si le logiciel demande d'ouvrir une
// fiche, de choisir un sens de mouvement et de valider un formulaire, personne
// ne le fera, et le stock sera faux au bout de trois jours. D'où le « − »
// directement sur la ligne : un clic, une sortie, le journal est écrit.
//
// Le reste — l'entrée de livraison, l'inventaire, le motif — vit dans un
// panneau qu'on ouvre quand on en a besoin.
//
// ── CE QU'IL MONTRE D'ABORD ─────────────────────────────────────────────────
//
// « À commander » est le filtre par défaut dès qu'il y a quelque chose
// dedans. Un stock se consulte pour savoir ce qui manque, pas pour relire
// quatre-vingts lignes qui vont bien.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Package, Plus, Minus, AlertTriangle, CalendarClock, History,
  Pencil, Archive, Search, X, Check,
} from 'lucide-react'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  alertesStock, etatArticle, etatPeremption, niveauLigne, ETAT_LABEL, SENS_LABEL,
  UNITES_STOCK, valeurStock, jourMaroc,
  type ArticleStock, type MouvementStock, type SensMouvement, type NiveauLigne,
} from '@/lib/stock'

type Filtre = 'commander' | 'tous' | 'peremption'

// La couleur suit le PIRE des deux soucis, la quantité et la péremption —
// sans quoi un produit périmé dont il reste quatre seringues s'affichait en
// blanc, c'est-à-dire comme s'il allait bien.
const COULEUR: Record<NiveauLigne, string> = {
  rouge:  'text-red-700 bg-red-50 border-red-200',
  orange: 'text-amber-700 bg-amber-50 border-amber-200',
  neutre: 'text-gray-600 bg-white border-gray-200',
}

export default function StockClient({ categories }: { categories: string[] }) {
  const [articles, setArticles] = useState<ArticleStock[]>([])
  const [chargement, setChargement] = useState(true)
  const [indisponible, setIndisponible] = useState<string | null>(null)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [recherche, setRecherche] = useState('')
  const [nouveau, setNouveau] = useState(false)
  const [edition, setEdition] = useState<string | null>(null)
  const [mouvement, setMouvement] = useState<string | null>(null)
  const [journal, setJournal] = useState<string | null>(null)

  const aujourdhui = jourMaroc(getNowInMaroc())

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/stock')
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErreur(d.error || 'Lecture impossible'); return }
      if (d.indisponible) { setIndisponible(d.message || 'Fonctionnalité en attente'); return }
      setArticles(d.articles ?? [])
      setIndisponible(null)
    } catch {
      setErreur('Le stock n’a pas pu être chargé.')
    } finally { setChargement(false) }
  }, [])
  useEffect(() => { charger() }, [charger])

  const alertes = useMemo(() => alertesStock(articles, aujourdhui), [articles, aujourdhui])
  const valeur = useMemo(() => valeurStock(articles), [articles])

  // Le filtre par défaut suit ce qu'il y a à voir : s'il manque quelque chose,
  // c'est cela qu'on ouvre. Une seule fois, après le premier chargement — sans
  // quoi le filtre choisi à la main serait écrasé à chaque rafraîchissement.
  const [filtreRegle, setFiltreRegle] = useState(false)
  useEffect(() => {
    if (filtreRegle || chargement) return
    if (alertes.aCommander.length > 0) setFiltre('commander')
    setFiltreRegle(true)
  }, [filtreRegle, chargement, alertes.aCommander.length])

  const visibles = useMemo(() => {
    let liste = articles
    if (filtre === 'commander') liste = alertes.aCommander
    if (filtre === 'peremption') liste = [...alertes.perimes, ...alertes.bientotPerimes]
    const q = recherche.trim().toLowerCase()
    if (q) {
      liste = liste.filter((a) =>
        [a.nom, a.categorie, a.reference, a.fournisseur]
          .some((v) => (v ?? '').toLowerCase().includes(q)))
    }
    return liste
  }, [articles, filtre, alertes, recherche])

  // Les lignes rangées par catégorie : une étagère se lit par rayon.
  const parCategorie = useMemo(() => {
    const m = new Map<string, ArticleStock[]>()
    for (const a of visibles) {
      const c = (a.categorie ?? '').trim() || 'Sans catégorie'
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(a)
    }
    return Array.from(m.entries()).sort((x, y) => x[0].localeCompare(y[0], 'fr'))
  }, [visibles])

  function flash(texte: string) {
    setMessage(texte)
    setTimeout(() => setMessage(''), 4000)
  }

  async function bouger(id: string, sens: SensMouvement, quantite: number, motif?: string) {
    setErreur('')
    const r = await fetch(`/api/stock/${id}/mouvement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sens, quantite, motif }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(d.error || 'Mouvement impossible'); return false }
    // On remplace la ligne par ce que la BASE renvoie, pas par ce qu'on avait
    // calculé : le nombre affiché doit être celui qui est enregistré.
    if (d.article) {
      setArticles((xs) => xs.map((a) => (a.id === id ? { ...a, ...d.article } : a)))
    } else { await charger() }
    if (d.avertissement) setErreur(d.avertissement)
    return true
  }

  if (indisponible) {
    return (
      <Cadre>
        <p className="text-sm text-gray-500">{indisponible}</p>
        <p className="text-xs text-gray-400 mt-1">
          L’écran s’activera de lui-même une fois la migration passée. Rien d’autre à faire.
        </p>
      </Cadre>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary-500" /> Stock du cabinet
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Ce qui s’épuise sans prévenir : consommables, matériaux, petit matériel.
          </p>
        </div>
        <button
          onClick={() => { setNouveau(true); setEdition(null) }}
          className="flex items-center gap-1.5 text-sm font-medium bg-primary-500 text-white rounded-lg px-3 py-2 hover:bg-primary-600 transition"
        >
          <Plus className="h-4 w-4" /> Nouvel article
        </button>
      </div>

      {/* ── Ce qu'il y a à signaler ──────────────────────────────────────── */}
      {!alertes.rien && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> À regarder avant de commander
          </p>
          {alertes.aCommander.length > 0 && (
            <p>{alertes.aCommander.length} article{alertes.aCommander.length > 1 ? 's' : ''} au seuil ou épuisé{alertes.aCommander.length > 1 ? 's' : ''}.</p>
          )}
          {alertes.perimes.length > 0 && (
            <p className="text-red-700">{alertes.perimes.length} article{alertes.perimes.length > 1 ? 's' : ''} périmé{alertes.perimes.length > 1 ? 's' : ''} — à sortir du stock.</p>
          )}
          {alertes.bientotPerimes.length > 0 && (
            <p>{alertes.bientotPerimes.length} article{alertes.bientotPerimes.length > 1 ? 's' : ''} périme{alertes.bientotPerimes.length > 1 ? 'nt' : ''} dans moins de deux mois.</p>
          )}
        </div>
      )}

      {/* ── Filtres et recherche ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          ['commander', `À commander${alertes.aCommander.length ? ` (${alertes.aCommander.length})` : ''}`],
          ['peremption', `Péremptions${alertes.perimes.length + alertes.bientotPerimes.length ? ` (${alertes.perimes.length + alertes.bientotPerimes.length})` : ''}`],
          ['tous', `Tout (${articles.length})`],
        ] as [Filtre, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFiltre(k)}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border transition ${
              filtre === k ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, référence, fournisseur…"
            className="text-xs rounded-lg border border-gray-200 pl-8 pr-2 py-1.5 w-56" />
        </div>
      </div>

      {erreur && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>
      )}
      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Check className="h-4 w-4" /> {message}
        </p>
      )}

      {/* ── Création ─────────────────────────────────────────────────────── */}
      {nouveau && (
        <FicheArticle
          categories={categories}
          onAnnuler={() => setNouveau(false)}
          onEnregistrer={async (champs) => {
            const r = await fetch('/api/stock', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(champs),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) { setErreur(d.error || 'Création impossible'); return false }
            setNouveau(false); setErreur('')
            flash(`« ${d.article?.nom ?? champs.nom} » est entré au stock.`)
            await charger()
            return true
          }}
        />
      )}

      {/* ── La liste ─────────────────────────────────────────────────────── */}
      {chargement ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : articles.length === 0 ? (
        <Cadre>
          <p className="text-sm text-gray-600 font-medium">Votre stock est vide.</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Rien n’est livré d’avance : les références et les tarifs d’un cabinet ne sont pas
            ceux d’un autre. Commencez par ce qui vous a déjà manqué un matin — cartouches
            d’anesthésique, composite, gants, limes — avec la quantité que vous avez sous la main
            et le seuil à partir duquel vous voulez être prévenu.
          </p>
        </Cadre>
      ) : visibles.length === 0 ? (
        <Cadre>
          <p className="text-sm text-gray-600">
            {filtre === 'commander' ? 'Rien à commander : tous vos articles sont au-dessus de leur seuil.'
             : filtre === 'peremption' ? 'Aucune péremption proche.'
             : 'Aucun article ne correspond à cette recherche.'}
          </p>
        </Cadre>
      ) : (
        <div className="space-y-4">
          {parCategorie.map(([cat, lignes]) => (
            <div key={cat}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{cat}</p>
              <div className="space-y-1.5">
                {lignes.map((a: ArticleStock) => (
                  <Ligne
                    key={a.id}
                    article={a}
                    aujourdhui={aujourdhui}
                    categories={categories}
                    enEdition={edition === a.id}
                    enMouvement={mouvement === a.id}
                    journalOuvert={journal === a.id}
                    onEditer={() => { setEdition(edition === a.id ? null : a.id); setMouvement(null) }}
                    onMouvement={() => { setMouvement(mouvement === a.id ? null : a.id); setEdition(null) }}
                    onJournal={() => setJournal(journal === a.id ? null : a.id)}
                    onBouger={bouger}
                    onEnregistrer={async (champs) => {
                      const r = await fetch(`/api/stock/${a.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(champs),
                      })
                      const d = await r.json().catch(() => ({}))
                      if (!r.ok) { setErreur(d.error || 'Modification impossible'); return false }
                      setArticles((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...d.article } : x)))
                      setEdition(null); setErreur(''); flash('Fiche modifiée.')
                      return true
                    }}
                    onArchiver={async () => {
                      const r = await fetch(`/api/stock/${a.id}`, { method: 'DELETE' })
                      const d = await r.json().catch(() => ({}))
                      if (!r.ok) { setErreur(d.error || 'Archivage impossible'); return }
                      setArticles((xs) => xs.filter((x) => x.id !== a.id))
                      flash(`« ${a.nom} » est archivé. Son journal reste conservé.`)
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── La valeur de l'étagère ───────────────────────────────────────── */}
      {valeur.chiffres > 0 && (
        <p className="text-[11px] text-gray-400">
          Valeur d’achat du stock : {valeur.total.toFixed(2)} DH, sur {valeur.chiffres} article
          {valeur.chiffres > 1 ? 's' : ''} dont le prix est renseigné
          {valeur.chiffres < valeur.total_articles && ` (sur ${valeur.total_articles})`}.
          Les autres ne sont pas comptés : un prix absent n’est pas un prix nul.
        </p>
      )}
    </div>
  )
}

function Cadre({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-gray-100 rounded-xl p-5">{children}</div>
}

// ── UNE LIGNE ───────────────────────────────────────────────────────────────

function Ligne({
  article: a, aujourdhui, categories, enEdition, enMouvement, journalOuvert,
  onEditer, onMouvement, onJournal, onBouger, onEnregistrer, onArchiver,
}: {
  article: ArticleStock
  aujourdhui: string
  categories: string[]
  enEdition: boolean
  enMouvement: boolean
  journalOuvert: boolean
  onEditer: () => void
  onMouvement: () => void
  onJournal: () => void
  onBouger: (id: string, sens: SensMouvement, q: number, motif?: string) => Promise<boolean>
  onEnregistrer: (champs: Record<string, unknown>) => Promise<boolean>
  onArchiver: () => void
}) {
  const etat = etatArticle(a)
  const perim = etatPeremption(a, aujourdhui)
  const [occupe, setOccupe] = useState(false)

  async function rapide(sens: SensMouvement) {
    setOccupe(true)
    await onBouger(a.id, sens, 1, sens === 'sortie' ? 'Au fauteuil' : 'Réassort')
    setOccupe(false)
  }

  return (
    <div className={`border rounded-xl ${COULEUR[niveauLigne(a, aujourdhui)]}`}>
      <div className="flex items-center gap-2 p-2.5 flex-wrap">
        {/* Le nom et ce qui le qualifie */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {a.nom}
            {a.reference && <span className="text-[11px] text-gray-400 font-normal ml-1.5">réf. {a.reference}</span>}
          </p>
          <p className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
            {a.fournisseur && <span>{a.fournisseur}</span>}
            {a.seuil_alerte != null && <span>seuil {Number(a.seuil_alerte)} {a.unite}</span>}
            {a.peremption && (
              <span className={perim === 'perime' ? 'text-red-700 font-semibold' : perim === 'proche' ? 'text-amber-700 font-semibold' : ''}>
                <CalendarClock className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                {perim === 'perime' ? 'périmé le ' : 'périme le '}{formatDateShort(a.peremption)}
              </span>
            )}
          </p>
        </div>

        {/* Le compte, et le geste d'un clic */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => rapide('sortie')} disabled={occupe}
            title="Une sortie — consommé au fauteuil"
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
          // Une ligne rouge sans étiquette laisse chercher POURQUOI elle est
          // rouge : la quantité va bien, c'est la date qui ne va pas.
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-red-200 text-red-900">
            Périmé
          </span>
        ) : null}

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMouvement} title="Entrée, sortie, inventaire"
            className="text-[11px] text-primary-600 hover:text-primary-700 px-1.5">Mouvement</button>
          <button onClick={onJournal} title="Journal de l’article"
            className="text-gray-400 hover:text-gray-600 p-1"><History className="h-3.5 w-3.5" /></button>
          <button onClick={onEditer} title="Modifier la fiche"
            className="text-gray-400 hover:text-gray-600 p-1"><Pencil className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {enMouvement && (
        <PanneauMouvement
          article={a}
          onAnnuler={onMouvement}
          onValider={async (sens, q, motif) => {
            const ok = await onBouger(a.id, sens, q, motif)
            if (ok) onMouvement()
            return ok
          }}
        />
      )}

      {enEdition && (
        <div className="border-t border-gray-200 bg-white rounded-b-xl">
          <FicheArticle
            article={a}
            categories={categories}
            onAnnuler={onEditer}
            onEnregistrer={onEnregistrer}
            onArchiver={onArchiver}
          />
        </div>
      )}

      {journalOuvert && <Journal articleId={a.id} unite={a.unite} />}
    </div>
  )
}

// ── LE PANNEAU DE MOUVEMENT ─────────────────────────────────────────────────

function PanneauMouvement({
  article: a, onAnnuler, onValider,
}: {
  article: ArticleStock
  onAnnuler: () => void
  onValider: (sens: SensMouvement, q: number, motif?: string) => Promise<boolean>
}) {
  const [sens, setSens] = useState<SensMouvement>('entree')
  const [q, setQ] = useState('')
  const [motif, setMotif] = useState('')
  const [occupe, setOccupe] = useState(false)

  return (
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
            await onValider(sens, n, motif.trim() || undefined)
            setOccupe(false)
          }}
          className="text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 disabled:opacity-60">
          {occupe ? 'Enregistrement…' : 'Enregistrer le mouvement'}
        </button>
        <button type="button" onClick={onAnnuler} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
      </div>
    </div>
  )
}

// ── LE JOURNAL ──────────────────────────────────────────────────────────────
//
// Sans lui, un stock qui a dérivé est indéchiffrable : on voit « 3 » et on ne
// sait pas s'il en est sorti douze ou s'il n'en est jamais entré que trois.
function Journal({ articleId, unite }: { articleId: string; unite: string }) {
  const [lignes, setLignes] = useState<MouvementStock[] | null>(null)

  useEffect(() => {
    fetch(`/api/stock/${articleId}/mouvement`)
      .then((r) => (r.ok ? r.json() : { mouvements: [] }))
      .then((d) => setLignes(d.mouvements ?? []))
      .catch(() => setLignes([]))
  }, [articleId])

  return (
    <div className="border-t border-gray-200 bg-white rounded-b-xl p-3">
      {lignes === null ? (
        <p className="text-[11px] text-gray-400">Chargement du journal…</p>
      ) : lignes.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">Aucun mouvement enregistré pour cet article.</p>
      ) : (
        <ul className="space-y-0.5">
          {lignes.map((m) => (
            <li key={m.id} className="text-[11px] text-gray-600 flex items-center gap-2 flex-wrap">
              <span className="text-gray-400 tabular-nums">{formatDateShort(m.created_at.slice(0, 10))}</span>
              <span className={`font-medium ${
                m.sens === 'entree' ? 'text-emerald-700' : m.sens === 'sortie' ? 'text-red-700' : 'text-gray-700'}`}>
                {SENS_LABEL[m.sens]} {m.sens === 'entree' ? '+' : m.sens === 'sortie' ? '−' : '='}{Number(m.quantite)}
              </span>
              <span className="text-gray-400">reste {Number(m.quantite_apres)} {unite}</span>
              {m.motif && <span className="text-gray-500 truncate">· {m.motif}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── LA FICHE (création et modification) ─────────────────────────────────────

function FicheArticle({
  article, categories, onAnnuler, onEnregistrer, onArchiver,
}: {
  article?: ArticleStock
  categories: string[]
  onAnnuler: () => void
  onEnregistrer: (champs: Record<string, unknown>) => Promise<boolean>
  onArchiver?: () => void
}) {
  const [nom, setNom] = useState(article?.nom ?? '')
  const [categorie, setCategorie] = useState(article?.categorie ?? '')
  const [reference, setReference] = useState(article?.reference ?? '')
  const [fournisseur, setFournisseur] = useState(article?.fournisseur ?? '')
  const [unite, setUnite] = useState(article?.unite ?? 'unité')
  const [quantite, setQuantite] = useState('')
  const [seuil, setSeuil] = useState(article?.seuil_alerte != null ? String(article.seuil_alerte) : '')
  const [peremption, setPeremption] = useState(article?.peremption ?? '')
  const [prix, setPrix] = useState(article?.prix_achat != null ? String(article.prix_achat) : '')
  const [notes, setNotes] = useState(article?.notes ?? '')
  const [occupe, setOccupe] = useState(false)
  const [confirmeArchive, setConfirmeArchive] = useState(false)

  const champ = 'text-sm rounded-lg border border-gray-200 px-2.5 py-1.5 w-full'

  return (
    <div className="bg-white border border-primary-200 rounded-xl p-3 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] text-gray-500">Nom de l’article</span>
          <input value={nom} onChange={(e) => setNom(e.target.value)} className={champ}
            placeholder="Cartouche articaïne 1/100 000" />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500">Catégorie</span>
          <input value={categorie} onChange={(e) => setCategorie(e.target.value)} className={champ}
            list="categories-stock" placeholder="Anesthésie" />
          <datalist id="categories-stock">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500">Unité de comptage</span>
          <input value={unite} onChange={(e) => setUnite(e.target.value)} className={champ}
            list="unites-stock" placeholder="cartouche" />
          <datalist id="unites-stock">
            {UNITES_STOCK.map((u) => <option key={u} value={u} />)}
          </datalist>
        </label>
        {!article && (
          <label className="block">
            <span className="text-[11px] text-gray-500">Quantité en rayon aujourd’hui</span>
            <input value={quantite} onChange={(e) => setQuantite(e.target.value)} inputMode="decimal"
              className={champ} placeholder="0" />
          </label>
        )}
        <label className="block">
          <span className="text-[11px] text-gray-500">Me prévenir à partir de</span>
          <input value={seuil} onChange={(e) => setSeuil(e.target.value)} inputMode="decimal"
            className={champ} placeholder="laisser vide pour ne pas être prévenu" />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500">Péremption la plus proche</span>
          <input type="date" value={peremption ?? ''} onChange={(e) => setPeremption(e.target.value)} className={champ} />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500">Fournisseur</span>
          <input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} className={champ} />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500">Référence fournisseur</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={champ} />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500">Prix d’achat unitaire (DH)</span>
          <input value={prix} onChange={(e) => setPrix(e.target.value)} inputMode="decimal" className={champ} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[11px] text-gray-500">Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={champ}
            placeholder="Teinte, lot, emplacement dans le meuble…" />
        </label>
      </div>

      {article && (
        <p className="text-[11px] text-gray-400">
          La quantité ne se modifie pas ici : elle ne change que par un mouvement, pour que
          le journal explique toujours le chiffre affiché.
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={occupe}
          onClick={async () => {
            setOccupe(true)
            const champs: Record<string, unknown> = {
              nom, categorie, reference, fournisseur, unite,
              seuil_alerte: seuil === '' ? null : seuil,
              peremption: peremption || null,
              prix_achat: prix === '' ? null : prix,
              notes,
            }
            if (!article) champs.quantite = quantite === '' ? 0 : quantite
            await onEnregistrer(champs)
            setOccupe(false)
          }}
          className="text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 disabled:opacity-60">
          {occupe ? 'Enregistrement…' : article ? 'Enregistrer la fiche' : 'Ajouter au stock'}
        </button>
        <button type="button" onClick={onAnnuler} className="text-xs text-gray-400 hover:text-gray-600">
          Annuler
        </button>
        {onArchiver && (
          <div className="ml-auto flex items-center gap-1.5">
            {confirmeArchive ? (
              <>
                <span className="text-[11px] text-gray-500">Archiver « {article?.nom} » ?</span>
                <button type="button" onClick={onArchiver}
                  className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                  Oui, archiver
                </button>
                <button type="button" onClick={() => setConfirmeArchive(false)}
                  className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmeArchive(true)}
                className="text-[11px] text-gray-400 hover:text-red-600 flex items-center gap-1">
                <Archive className="h-3 w-3" /> Je ne tiens plus cet article
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
