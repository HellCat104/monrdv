'use client'

// LA LISTE DES ACTES DU PATIENT — tout ce qui est fait, en cours, à faire.
//
// Une seule liste, quel que soit l'endroit d'où vient l'acte : ajouté depuis
// le schéma, ou ligne d'un plan de traitement accepté (elle y entre « à
// faire » et suit le devis dans les deux sens, côté serveur).
//
// C'est aussi d'ici que part la feuille de soins : on coche les actes, on
// clique « Feuille de soins », et la feuille s'ouvre avec exactement ces
// lignes, cotées. Un acte porté sur une feuille le dit, et ne peut plus être
// coché pour une autre : la même séance ne se fait pas rembourser deux fois.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FeuilleSoinsCard from '@/components/dashboard/FeuilleSoinsCard'
import FenetreActe from '@/components/dentaire/FenetreActe'
import {
  STATUTS_ACTE, LIBELLE_STATUT, catalogueDuCabinet, changementsSchema, libelleDents, totauxActes,
  type ActeCatalogue, type ActePatient, type ChangementSchema, type StatutActe, type TarifCabinet,
} from '@/lib/actes-patient'
import { formatDateShort } from '@/lib/utils'
import { ClipboardList, FileSpreadsheet, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'

const DH = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`

type Filtre = 'tous' | StatutActe

export default function RegistreActes({
  patientId, appointmentId = null, mutuelle = null, inpe = null, demande = null, onSchema,
  statutParDefaut = 'fini', onIndisponible,
}: {
  patientId: string
  /** La séance en cours, quand la liste est ouverte en consultation. */
  appointmentId?: string | null
  mutuelle?: string | null
  inpe?: string | null
  /** « Ajouter un acte » demandé depuis le schéma, avec ses dents. Chaque
   *  nouveau jeton ouvre la fenêtre. */
  demande?: { jeton: number; dents: string[]; faces?: string[] } | null
  /** Ce que le schéma doit montrer après un acte (et le signal de vider sa
   *  sélection). */
  onSchema?: (changements: ChangementSchema[]) => void
  statutParDefaut?: StatutActe
  /** Prévient l'écran parent quand la liste n'existe pas sur cette base
   *  (migration v101 non passée) : le schéma garde alors son clic d'avant. */
  onIndisponible?: () => void
}) {
  const [actes, setActes] = useState<ActePatient[]>([])
  const [active, setActive] = useState(true)
  const [charge, setCharge] = useState(false)
  const [erreur, setErreur] = useState(false)
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [coches, setCoches] = useState<string[]>([])
  const [fenetre, setFenetre] = useState<{ dents: string[]; faces?: string[]; acte: ActePatient | null } | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [feuille, setFeuille] = useState(false)
  const [tarifs, setTarifs] = useState<TarifCabinet[]>([])
  const [derniers, setDerniers] = useState<Record<string, number>>({})
  const [catalogueCharge, setCatalogueCharge] = useState(false)
  const [message, setMessage] = useState('')

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/dentaire/actes?patient_id=${encodeURIComponent(patientId)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur(true); return }
      setErreur(false)
      setActive(data.active !== false)
      if (data.active === false) onIndisponible?.()
      setActes((data.actes ?? []) as ActePatient[])
    } catch {
      setErreur(true)
    } finally {
      setCharge(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  const chargerCatalogue = useCallback(async () => {
    try {
      const res = await fetch('/api/dentaire/tarifs')
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setTarifs(data.tarifs ?? []); setDerniers(data.derniers ?? {}) }
    } finally {
      setCatalogueCharge(true)
    }
  }, [])

  useEffect(() => { charger(); chargerCatalogue() }, [charger, chargerCatalogue])

  // Une demande venue du schéma ouvre la fenêtre avec ses dents.
  useEffect(() => {
    if (demande) setFenetre({ dents: demande.dents, faces: demande.faces ?? [], acte: null })
  }, [demande])

  const catalogue: ActeCatalogue[] = useMemo(() => catalogueDuCabinet(tarifs), [tarifs])
  const visibles = filtre === 'tous' ? actes : actes.filter((a) => a.statut === filtre)
  const totaux = totauxActes(actes)
  const cochables = (a: ActePatient) => a.statut !== 'annule' && !a.care_sheet_id
  const choisis = actes.filter((a) => coches.includes(a.id) && cochables(a))

  function apresEnregistrement(nouveaux: ActePatient[], changements: ChangementSchema[] | null) {
    setActes((prev) => {
      const parId = new Map(prev.map((a) => [a.id, a]))
      for (const a of nouveaux) parId.set(a.id, a)
      return Array.from(parId.values()).sort((a, b) => b.date_acte.localeCompare(a.date_acte) || b.created_at.localeCompare(a.created_at))
    })
    onSchema?.(changements ?? [])
    // Le prix qu'on vient de pratiquer revient dès l'acte suivant.
    chargerCatalogue()
  }

  async function changerStatut(a: ActePatient, statut: StatutActe) {
    if (statut === a.statut) return
    setMessage('')
    const avant = actes
    setActes((prev) => prev.map((x) => (x.id === a.id ? { ...x, statut } : x)))
    try {
      const res = await fetch(`/api/dentaire/actes/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setActes(avant); setMessage(data.error || 'Le statut n’a pas pu être changé.'); return }
      setActes((prev) => prev.map((x) => (x.id === a.id ? data.acte : x)))
      // Le schéma suit : un acte qui passe à « fini » s'y dessine réalisé.
      if (statut !== 'annule') onSchema?.(changementsSchema({ ...a, statut }))
    } catch {
      setActes(avant)
      setMessage('La connexion a été interrompue. Réessayez.')
    }
  }

  async function supprimer(a: ActePatient) {
    setMenu(null)
    if (!confirm(`Supprimer l’acte « ${a.libelle} » du ${formatDateShort(a.date_acte)} ?`)) return
    const res = await fetch(`/api/dentaire/actes/${a.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMessage(data.error || 'Suppression impossible.'); return }
    setActes((prev) => prev.filter((x) => x.id !== a.id))
    setCoches((prev) => prev.filter((id) => id !== a.id))
  }

  async function feuilleEtablie(feuilleId: string) {
    const ids = choisis.map((a) => a.id)
    await fetch('/api/dentaire/actes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, care_sheet_id: feuilleId }),
    }).catch(() => {})
    setCoches([])
    charger()
  }

  // Règle de la maison : sans sa migration, une fonctionnalité disparaît
  // au lieu d'afficher une erreur au praticien.
  if (charge && !active) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl">
      {/* EN-TÊTE : ce qu'on peut faire */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mr-auto">
          <ClipboardList className="h-4 w-4 text-primary-500" /> Actes
          {actes.length > 0 && <span className="text-[11px] font-normal text-gray-400">{actes.length}</span>}
        </h3>
        <button type="button" onClick={() => setFeuille(true)} disabled={choisis.length === 0}
          title={choisis.length === 0 ? 'Cochez les actes à porter sur la feuille' : undefined}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-2.5 py-1.5 border border-primary-200 text-primary-700 bg-white hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Feuille de soins ({choisis.length})
        </button>
        <button type="button" onClick={() => setFenetre({ dents: [], acte: null })}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 bg-primary-500 text-white hover:bg-primary-600">
          <Plus className="h-3.5 w-3.5" /> Ajouter un acte
        </button>
      </div>

      {/* FILTRES PAR STATUT */}
      <div className="flex flex-wrap gap-1 px-4 pb-2">
        {(['tous', ...STATUTS_ACTE.map((s) => s.cle)] as Filtre[]).map((f) => {
          const n = f === 'tous' ? actes.length : totaux[f].n
          return (
            <button key={f} type="button" onClick={() => setFiltre(f)}
              className={`text-[11.5px] rounded-full px-2.5 py-0.5 border transition ${filtre === f ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {f === 'tous' ? 'Tous' : LIBELLE_STATUT[f]} <span className={filtre === f ? 'text-gray-300' : 'text-gray-400'}>{n}</span>
            </button>
          )
        })}
      </div>

      {message && <p className="mx-4 mb-2 text-[12px] text-red-700 bg-red-50 rounded-lg px-3 py-1.5">{message}</p>}
      {erreur && (
        <p className="mx-4 mb-3 text-[12px] text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          La liste des actes n’a pas pu être lue.{' '}
          <button type="button" onClick={charger} className="underline font-medium">Réessayer</button>
        </p>
      )}

      {!charge ? (
        <div className="px-4 pb-4"><div className="h-16 bg-gray-50 rounded-lg animate-pulse" /></div>
      ) : visibles.length === 0 && !erreur ? (
        <p className="px-4 pb-4 text-[12.5px] text-gray-400">
          {actes.length === 0
            ? 'Aucun acte pour ce patient. Touchez des dents sur le schéma, puis « Ajouter un acte ».'
            : 'Aucun acte avec ce statut.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-y border-gray-100 bg-gray-50/60">
                <th className="w-9 pl-4 py-2">
                  <input type="checkbox" aria-label="Tout cocher"
                    checked={visibles.some(cochables) && visibles.filter(cochables).every((a) => coches.includes(a.id))}
                    onChange={(e) => setCoches(e.target.checked ? Array.from(new Set([...coches, ...visibles.filter(cochables).map((a) => a.id)])) : coches.filter((id) => !visibles.some((a) => a.id === id)))} />
                </th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Dents</th>
                <th className="py-2 pr-3 font-medium">Acte</th>
                <th className="py-2 pr-3 font-medium text-right">Prix</th>
                <th className="py-2 pr-3 font-medium">Statut</th>
                <th className="w-10 py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const s = STATUTS_ACTE.find((x) => x.cle === a.statut)!
                return (
                  <tr key={a.id} className={`border-b border-gray-50 align-top ${a.statut === 'annule' ? 'text-gray-400' : 'text-gray-800'}`}>
                    <td className="pl-4 py-2.5">
                      <input type="checkbox" disabled={!cochables(a)} checked={coches.includes(a.id) && cochables(a)}
                        aria-label={`Cocher ${a.libelle}`}
                        title={a.care_sheet_id ? 'Déjà sur une feuille de soins' : a.statut === 'annule' ? 'Acte annulé' : undefined}
                        onChange={(e) => setCoches((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))} />
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">{formatDateShort(a.date_acte)}</td>
                    <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{libelleDents(a.dents)}</td>
                    <td className="py-2.5 pr-3 min-w-[220px]">
                      <p className={a.statut === 'annule' ? 'line-through' : ''}>{a.libelle}</p>
                      <p className="text-[11px] text-gray-400 flex flex-wrap gap-x-2">
                        {a.code && <span className="font-mono">{a.code}</span>}
                        {a.faces.length > 0 && <span>faces {a.faces.join('')}</span>}
                        {a.quote_item_id && <span className="text-violet-600">plan de traitement</span>}
                        {a.care_sheet_id && <span className="text-emerald-700">sur une feuille de soins</span>}
                      </p>
                      {a.remarque && <p className="text-[11.5px] text-gray-500 mt-0.5">{a.remarque}</p>}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">{DH(a.prix)}</td>
                    <td className="py-2.5 pr-3">
                      <select value={a.statut} onChange={(e) => changerStatut(a, e.target.value as StatutActe)}
                        aria-label="Statut de l’acte"
                        className={`text-[12px] font-medium rounded-full border pl-2.5 pr-6 py-0.5 ${s.pastille}`}>
                        {STATUTS_ACTE.map((x) => <option key={x.cle} value={x.cle}>{x.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3 relative">
                      <button type="button" onClick={() => setMenu(menu === a.id ? null : a.id)} aria-label="Actions"
                        className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menu === a.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                          <div className="absolute right-3 top-8 z-20 w-40 rounded-lg border border-gray-100 bg-white shadow-lg py-1">
                            <button type="button" onClick={() => { setMenu(null); setFenetre({ dents: a.dents, acte: a }) }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-gray-700 hover:bg-gray-50">
                              <Pencil className="h-3.5 w-3.5" /> Modifier
                            </button>
                            <button type="button" onClick={() => supprimer(a)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-red-600 hover:bg-red-50">
                              <Trash2 className="h-3.5 w-3.5" /> Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {actes.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-t border-gray-100 text-[12px] text-gray-500">
          {STATUTS_ACTE.filter((s) => s.cle !== 'annule' && totaux[s.cle].n > 0).map((s) => (
            <span key={s.cle}>{s.label} : <strong className="text-gray-700">{DH(totaux[s.cle].montant)}</strong> ({totaux[s.cle].n})</span>
          ))}
        </div>
      )}

      <FenetreActe
        ouvert={!!fenetre}
        onFermer={() => setFenetre(null)}
        patientId={patientId}
        appointmentId={appointmentId}
        dentsInitiales={fenetre?.dents ?? []}
        facesInitiales={fenetre?.faces ?? []}
        acte={fenetre?.acte ?? null}
        statutParDefaut={statutParDefaut}
        catalogue={catalogue}
        derniers={derniers}
        catalogueCharge={catalogueCharge}
        onEnregistre={apresEnregistrement}
      />

      {/* LA FEUILLE DE SOINS, avec exactement les actes cochés. */}
      <Dialog open={feuille} onOpenChange={setFeuille}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Feuille de soins — {choisis.length} acte{choisis.length > 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          {feuille && (
            <FeuilleSoinsCard
              patientId={patientId}
              appointmentId={appointmentId}
              dental
              mutuelle={mutuelle}
              inpe={inpe}
              declencheur={1}
              enFenetre
              actesChoisis={choisis.map((a) => ({ id: a.id, dents: a.dents, libelle: a.libelle, code: a.code, prix: a.prix, date: a.date_acte }))}
              onEtablie={feuilleEtablie}
              onFerme={() => setFeuille(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
