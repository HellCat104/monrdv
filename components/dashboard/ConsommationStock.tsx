'use client'

// « Qu'avez-vous utilisé ? » — la question posée à la clôture d'une
// consultation.
//
// ── POURQUOI ICI, ET PAS DANS L'ÉCRAN STOCK ─────────────────────────────────
//
// Un stock n'est juste que si chaque sortie est saisie, et personne n'ouvre
// l'écran Stock entre deux patients pour y retirer deux carpules. Le seul
// moment où le praticien a encore en tête ce qu'il vient d'ouvrir, c'est celui
// où il termine la consultation. La question se pose donc là — et elle doit
// coûter un clic, sinon elle sera passée à chaque fois.
//
// ── CE QUI EST DÉJÀ ÉCRIT QUAND LA FENÊTRE S'OUVRE ──────────────────────────
//
// 1. Ce que le cabinet a déduit LA DERNIÈRE FOIS pour le même motif (v99).
//    Ces lignes-là sont pré-remplies : un détartrage consomme la même chose
//    d'une fois sur l'autre, et il n'y a qu'à valider.
// 2. À défaut — la première fois — les articles des rayons où ce genre de
//    soin puise (lib/motifs-dentaires.ts). Ceux-là sont PROPOSÉS, pas
//    pré-remplis : le logiciel ne sait pas ce que le cabinet a ouvert, et
//    déduire à sa place fausserait le stock au lieu de le tenir.
//
// ── CE QUI RESTE AU PRATICIEN ───────────────────────────────────────────────
//
// Tout. Chaque quantité se corrige, chaque ligne se retire, n'importe quel
// article du stock s'ajoute. Ce qu'il valide devient l'habitude de la fois
// suivante. Et il peut terminer sans rien déduire : une question qu'on ne peut
// pas refuser finit par recevoir des réponses fausses.
import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Minus, Plus, X, PackageMinus, AlertTriangle } from 'lucide-react'
import { rayonsDuMotif } from '@/lib/motifs-dentaires'

export interface ArticleConsommable {
  id: string
  nom: string
  categorie?: string | null
  unite: string
  quantite: number
}

export interface DonneesConsommation {
  articles: ArticleConsommable[]
  habituels: { article_id: string; quantite: number }[]
  /** Faux tant que la v99 n'est pas passée : rien n'est pré-rempli, et rien
   *  ne sera retenu. La fenêtre le dit. */
  memoire: boolean
}

interface Ligne { article_id: string; quantite: string }

/** Combien de propositions au plus. Au-delà, ce n'est plus une suggestion,
 *  c'est l'inventaire du rayon. */
const MAX_PROPOSES = 10

const nombre = (v: string) => Number(String(v).replace(',', '.'))
const affiche = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

export default function ConsommationStock({
  ouvert, onOuvert, donnees, motifCle, motifNom, onFini,
}: {
  ouvert: boolean
  onOuvert: (ouvert: boolean) => void
  donnees: DonneesConsommation
  /** L'identifiant du motif du rendez-vous ; absent = « durée standard ». */
  motifCle: string | null
  motifNom: string | null
  /** La consultation peut se clôturer : le stock est déduit, ou le praticien
   *  a choisi de ne rien déduire. */
  onFini: () => void
}) {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const parId = useMemo(
    () => new Map(donnees.articles.map((a) => [a.id, a])),
    [donnees.articles],
  )

  // À chaque ouverture, on repart de l'habitude. Pas à chaque rendu : sinon la
  // quantité que le praticien vient de corriger reviendrait à sa valeur
  // d'avant au premier clic.
  useEffect(() => {
    if (!ouvert) return
    setErreur(null)
    setLignes(donnees.habituels.map((h) => ({
      article_id: h.article_id, quantite: affiche(Number(h.quantite)),
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert])

  const portes = new Set(lignes.map((l) => l.article_id))

  /** Les articles des rayons où ce soin puise, qui ne sont pas déjà dans la
   *  liste. Dans l'ordre des rayons : l'anesthésie avant les gants. */
  const proposes = useMemo(() => {
    const rayons = rayonsDuMotif(motifNom)
    if (rayons.length === 0) return []
    return donnees.articles
      .filter((a) => rayons.includes(a.categorie ?? ''))
      .sort((a, b) => rayons.indexOf(a.categorie ?? '') - rayons.indexOf(b.categorie ?? ''))
  }, [donnees.articles, motifNom])
  const aProposer = proposes.filter((a) => !portes.has(a.id)).slice(0, MAX_PROPOSES)

  /** Le stock rangé par rayon, pour le menu « Ajouter un article ». */
  const rayons = useMemo(() => {
    const par = new Map<string, ArticleConsommable[]>()
    for (const a of donnees.articles) {
      const r = (a.categorie ?? '').trim() || 'Autres'
      if (!par.has(r)) par.set(r, [])
      par.get(r)!.push(a)
    }
    return Array.from(par.entries())
  }, [donnees.articles])

  function ajouter(id: string) {
    if (!id || portes.has(id)) return
    setLignes((prev) => [...prev, { article_id: id, quantite: '1' }])
  }

  function changer(id: string, quantite: string) {
    setLignes((prev) => prev.map((l) => (l.article_id === id ? { ...l, quantite } : l)))
  }

  /** − et + d'une unité. On ne descend pas à zéro : retirer une ligne est un
   *  autre geste, et il a sa croix. */
  function pas(id: string, delta: number) {
    setLignes((prev) => prev.map((l) => {
      if (l.article_id !== id) return l
      const n = nombre(l.quantite)
      const suivant = Math.max(delta > 0 ? 1 : 0.5, (Number.isFinite(n) ? n : 0) + delta)
      return { ...l, quantite: affiche(suivant) }
    }))
  }

  const valides = lignes.filter((l) => {
    const n = nombre(l.quantite)
    return Number.isFinite(n) && n > 0
  })
  const incompletes = lignes.length - valides.length

  async function deduire() {
    if (valides.length === 0 || envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      const res = await fetch('/api/stock/consommation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motif_cle: motifCle,
          motif_nom: motifNom,
          lignes: valides.map((l) => ({ article_id: l.article_id, quantite: nombre(l.quantite) })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErreur(data.error || 'Le stock n’a pas pu être mis à jour. Réessayez.')
        return
      }
      const echecs: string[] = data.echecs ?? []
      if (echecs.length > 0) {
        // Ce qui est fait est fait : on ne garde à l'écran que ce qui a
        // échoué, pour qu'un second clic ne déduise pas deux fois le reste.
        setLignes((prev) => prev.filter((l) => echecs.includes(l.article_id)))
        setErreur(
          echecs.length === 1
            ? 'Un article n’a pas pu être déduit. Les autres le sont : réessayez pour celui qui reste, ou terminez sans lui.'
            : `${echecs.length} articles n’ont pas pu être déduits. Les autres le sont : réessayez pour ceux qui restent, ou terminez sans eux.`,
        )
        return
      }
      const avertissements: string[] = data.avertissements ?? []
      if (avertissements.length > 0) alert(avertissements.join('\n'))
      onFini()
    } catch {
      setErreur('Le stock n’a pas pu être mis à jour. Vérifiez la connexion.')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!envoi) onOuvert(o) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageMinus className="h-5 w-5 text-primary-500" />
            Qu&apos;avez-vous utilisé ?
          </DialogTitle>
          <p className="text-xs text-gray-500">
            {motifNom ? <>Pour « {motifNom} ». </> : null}
            Ce que vous validez est retiré du stock. Corrigez les quantités, retirez ce qui n&apos;a
            pas servi, ajoutez ce qui manque.
          </p>
        </DialogHeader>

        {/* ── Ce qui sera déduit ─────────────────────────────────────────── */}
        {lignes.length === 0 ? (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-3">
            {donnees.memoire
              ? 'Rien de retenu pour ce motif : c’est la première fois que vous le clôturez. Ajoutez ce qui a servi — la liste reviendra toute seule la prochaine fois.'
              : 'Ajoutez ce qui a servi.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {lignes.map((l) => {
              const a = parId.get(l.article_id)
              if (!a) return null
              const n = nombre(l.quantite)
              const reste = Number(a.quantite) - (Number.isFinite(n) ? n : 0)
              return (
                <li key={l.article_id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{a.nom}</p>
                    <p className={`text-[11px] ${reste < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {reste < 0
                        ? `Il n’en reste que ${affiche(Number(a.quantite))} en stock — le compte passera sous zéro`
                        : `En stock : ${affiche(Number(a.quantite))} · il en restera ${affiche(reste)}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => pas(a.id, -1)} aria-label="Une de moins"
                    className="h-7 w-7 shrink-0 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    value={l.quantite}
                    onChange={(e) => changer(a.id, e.target.value)}
                    inputMode="decimal"
                    aria-label={`Quantité de ${a.nom}`}
                    className="w-14 shrink-0 text-sm text-center border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
                  />
                  <button type="button" onClick={() => pas(a.id, 1)} aria-label="Une de plus"
                    className="h-7 w-7 shrink-0 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-16 shrink-0 text-[11px] text-gray-400 truncate">{a.unite}</span>
                  <button type="button" onClick={() => setLignes((prev) => prev.filter((x) => x.article_id !== a.id))}
                    title="Retirer : cet article n’a pas servi"
                    className="shrink-0 text-gray-300 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* ── Ce que ce genre de soin consomme souvent ───────────────────── */}
        {aProposer.length > 0 && (
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Souvent utilisés pour ce soin — cliquez pour ajouter</p>
            <div className="flex flex-wrap gap-1">
              {aProposer.map((a) => (
                <button key={a.id} type="button" onClick={() => ajouter(a.id)}
                  className="inline-flex items-center gap-1 text-[11px] border border-gray-200 rounded-full px-2.5 py-1 text-gray-700 hover:border-primary-300 hover:bg-primary-50">
                  <Plus className="h-3 w-3 text-primary-500" /> {a.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── N'importe quel article du stock ────────────────────────────── */}
        <select
          value=""
          onChange={(e) => ajouter(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-400"
        >
          <option value="">+ Ajouter un autre article du stock…</option>
          {rayons.map(([rayon, articles]) => (
            <optgroup key={rayon} label={rayon}>
              {articles.map((a) => (
                <option key={a.id} value={a.id} disabled={portes.has(a.id)}>
                  {a.nom} — {affiche(Number(a.quantite))} {a.unite}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {!donnees.memoire && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
            Le pré-remplissage attend une migration de la base (v99). Le stock est bien déduit ;
            c&apos;est la liste habituelle de ce motif qui ne sera pas retenue.
          </p>
        )}

        {erreur && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> {erreur}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button onClick={deduire} disabled={envoi || valides.length === 0}>
            {envoi ? 'Mise à jour du stock…' : 'Déduire du stock et terminer'}
          </Button>
          <Button variant="outline" onClick={onFini} disabled={envoi}>
            Terminer sans déduire
          </Button>
          <Button variant="ghost" onClick={() => onOuvert(false)} disabled={envoi}>Annuler</Button>
          {incompletes > 0 && (
            <span className="text-[11px] text-amber-700 basis-full">
              {incompletes === 1
                ? 'Une ligne n’a pas de quantité : elle ne sera pas déduite.'
                : `${incompletes} lignes n’ont pas de quantité : elles ne seront pas déduites.`}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
