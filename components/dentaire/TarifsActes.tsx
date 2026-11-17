'use client'

// RÉGLAGES — « Actes et tarifs » du cabinet dentaire.
//
// La liste de « Ajouter un acte » vient d'ici. Elle part du catalogue officiel
// (NGAP, avec son tarif de référence), et le cabinet y fixe SES prix, masque
// ce qu'il ne pratique pas, et ajoute ses actes à lui (implant, blanchiment,
// facette céramique…). Un prix laissé vide : la fenêtre de l'acte propose le
// dernier prix pratiqué, sinon le tarif de référence. Tout prix reste
// modifiable acte par acte au moment de la saisie.
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { catalogueDuCabinet, filtrerCatalogue, GROUPE_PERSO, type ActeCatalogue, type TarifCabinet } from '@/lib/actes-patient'
import { ChevronDown, Eye, EyeOff, Plus, Search, Tags, Trash2 } from 'lucide-react'

const DH = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`

export default function TarifsActes() {
  const [tarifs, setTarifs] = useState<TarifCabinet[]>([])
  const [active, setActive] = useState(true)
  const [charge, setCharge] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [ouverts, setOuverts] = useState<string[]>([GROUPE_PERSO])
  const [masquesVisibles, setMasquesVisibles] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauPrix, setNouveauPrix] = useState('')
  const [etat, setEtat] = useState<Record<string, 'enregistre' | 'erreur' | undefined>>({})
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    fetch('/api/dentaire/tarifs')
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) { setTarifs(d.tarifs ?? []); setActive(d.active !== false) } })
      .catch(() => {})
      .finally(() => setCharge(true))
  }, [])

  const catalogue = useMemo(() => catalogueDuCabinet(tarifs), [tarifs])
  const liste = useMemo(() => {
    const base = masquesVisibles ? catalogue : catalogue.filter((a) => a.actif)
    if (!recherche.trim()) return base
    const trouves = new Set(filtrerCatalogue(catalogue.map((a) => ({ ...a, actif: true })), recherche).map((a) => a.cle))
    return base.filter((a) => trouves.has(a.cle))
  }, [catalogue, recherche, masquesVisibles])
  const groupes = useMemo(() => {
    const m = new Map<string, ActeCatalogue[]>()
    m.set(GROUPE_PERSO, [])
    for (const a of liste) m.set(a.groupe, [...(m.get(a.groupe) ?? []), a])
    return Array.from(m.entries())
  }, [liste])
  const nbMasques = catalogue.filter((a) => !a.actif).length

  // Sans la migration v101, la section n'apparaît pas.
  if (charge && !active) return null

  async function enregistrer(a: ActeCatalogue, changement: { prix?: string; actif?: boolean; libelle?: string }) {
    setErreur('')
    const corps = a.perso ? { id: a.tarifId, ...changement } : { cle: a.cle, ...changement }
    const res = await fetch('/api/dentaire/tarifs', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setEtat((e) => ({ ...e, [a.cle]: 'erreur' })); setErreur(d.error || 'Enregistrement impossible.'); return }
    const t = d.tarif as TarifCabinet
    setTarifs((prev) => [...prev.filter((x) => x.id !== t.id), t])
    setEtat((e) => ({ ...e, [a.cle]: 'enregistre' }))
    setTimeout(() => setEtat((e) => ({ ...e, [a.cle]: undefined })), 1500)
  }

  async function ajouter() {
    const libelle = nouveauNom.trim()
    if (!libelle) return
    setErreur('')
    const res = await fetch('/api/dentaire/tarifs', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libelle, prix: nouveauPrix }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setErreur(d.error || 'Enregistrement impossible.'); return }
    setTarifs((prev) => [...prev, d.tarif as TarifCabinet])
    setNouveauNom(''); setNouveauPrix('')
  }

  async function retirer(a: ActeCatalogue) {
    if (!a.tarifId || !confirm(`Retirer « ${a.libelle} » de vos actes ?`)) return
    const res = await fetch(`/api/dentaire/tarifs?id=${a.tarifId}`, { method: 'DELETE' })
    if (res.ok) setTarifs((prev) => prev.filter((t) => t.id !== a.tarifId))
  }

  const basculerGroupe = (g: string) => setOuverts((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary-500" /> Actes et tarifs
        </CardTitle>
        <p className="text-xs text-gray-400 mt-1">
          La liste proposée dans « Ajouter un acte ». Fixez votre prix pour chaque acte (laissé vide, on vous
          propose le dernier prix pratiqué, sinon le tarif de référence AMO), masquez ce que vous ne pratiquez
          pas, et ajoutez vos propres actes. Le prix reste modifiable au moment de chaque saisie.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher un acte ou un code…" className="flex-1 text-sm py-2 focus:outline-none bg-transparent" />
          </div>
          {nbMasques > 0 && (
            <button type="button" onClick={() => setMasquesVisibles((v) => !v)}
              className="text-[12px] text-gray-600 border border-gray-200 rounded-lg px-2.5 py-2 hover:border-gray-300">
              {masquesVisibles ? 'Cacher les actes masqués' : `Voir les actes masqués (${nbMasques})`}
            </button>
          )}
        </div>

        {erreur && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erreur}</p>}

        {!charge ? (
          <div className="h-24 bg-gray-50 rounded-lg animate-pulse" />
        ) : (
          <div className="rounded-lg border border-gray-100 divide-y divide-gray-100">
            {groupes.map(([titre, actes]) => {
              const ouvert = ouverts.includes(titre) || !!recherche.trim()
              if (titre !== GROUPE_PERSO && actes.length === 0) return null
              return (
                <div key={titre}>
                  <button type="button" onClick={() => basculerGroupe(titre)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
                    <span className={`text-[13px] font-semibold ${titre === GROUPE_PERSO ? 'text-primary-700' : 'text-gray-700'}`}>{titre}</span>
                    <span className="text-[11px] text-gray-400">{actes.length}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 ml-auto transition-transform ${ouvert ? 'rotate-180' : ''}`} />
                  </button>
                  {ouvert && (
                    <div className="pb-2">
                      {actes.map((a) => (
                        <div key={a.cle} className={`flex flex-wrap items-center gap-2 px-3 py-1.5 ${a.actif ? '' : 'opacity-50'}`}>
                          {a.code && <span className="text-[11px] font-mono text-gray-400 w-11 shrink-0">{a.code}</span>}
                          <span className="text-[13px] text-gray-800 flex-1 min-w-[180px]">{a.libelle}</span>
                          {a.tnr != null && <span className="text-[11px] text-gray-400 whitespace-nowrap" title="Tarif national de référence (AMO)">réf. {DH(a.tnr)}</span>}
                          <input key={`${a.cle}-${a.prixCabinet ?? ''}`} defaultValue={a.prixCabinet ?? ''} inputMode="decimal"
                            placeholder={a.tnr != null ? String(a.tnr) : 'Prix'} aria-label={`Votre prix pour ${a.libelle}`}
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              if (v === String(a.prixCabinet ?? '')) return
                              enregistrer(a, { prix: v })
                            }}
                            className={`w-24 text-sm text-right border rounded-lg px-2 py-1 ${etat[a.cle] === 'erreur' ? 'border-red-300' : etat[a.cle] === 'enregistre' ? 'border-emerald-400' : 'border-gray-200'}`} />
                          <span className="text-[11px] text-gray-400 w-6">DH</span>
                          <button type="button" onClick={() => enregistrer(a, { actif: !a.actif })}
                            title={a.actif ? 'Masquer : ne plus proposer cet acte' : 'Proposer de nouveau cet acte'}
                            className="p-1 rounded text-gray-400 hover:text-gray-700">
                            {a.actif ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                          {a.perso && (
                            <button type="button" onClick={() => retirer(a)} title="Retirer cet acte"
                              className="p-1 rounded text-gray-300 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {titre === GROUPE_PERSO && (
                        <div className="flex flex-wrap items-center gap-2 px-3 pt-1.5">
                          <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') ajouter() }}
                            placeholder="Nouvel acte (ex. Implant, Blanchiment, Facette céramique)"
                            className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
                          <input value={nouveauPrix} onChange={(e) => setNouveauPrix(e.target.value)} inputMode="decimal"
                            onKeyDown={(e) => { if (e.key === 'Enter') ajouter() }}
                            placeholder="Prix" className="w-24 text-sm text-right border border-gray-200 rounded-lg px-2 py-1.5" />
                          <button type="button" onClick={ajouter} disabled={!nouveauNom.trim()}
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-2.5 py-1.5 disabled:opacity-40">
                            <Plus className="h-3.5 w-3.5" /> Ajouter
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
