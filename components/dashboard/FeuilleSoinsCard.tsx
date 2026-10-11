'use client'

// Feuille de soins — établissement et suivi, depuis la consultation ou le dossier.
//
// CE QUE L'ÉCRAN DOIT FAIRE DISPARAÎTRE
//
// Aujourd'hui le praticien recopie à la main, sur un formulaire, ce que le
// logiciel sait déjà : son identité, celle du patient, l'organisme, la date,
// les actes et leurs montants. L'écran ne demande donc QUE ce que la machine
// ne peut pas deviner — le code de nomenclature de chaque acte — et encore :
// une seule fois, puisqu'il est ensuite proposé avec l'acte.
//
// Les lignes arrivent pré-remplies avec les actes marqués « réalisés » du jour
// (plan de traitement), à défaut avec le montant de la consultation. Le
// praticien relit, corrige s'il le faut, et imprime.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateShort } from '@/lib/utils'
import { FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT } from '@/lib/dental'
import { STATUT_FEUILLE_LABELS, STATUTS_FEUILLE, totalFeuille, type StatutFeuille } from '@/lib/feuilles-soins'
import { FileSpreadsheet, Plus, Printer, Trash2 } from 'lucide-react'

const inputCls = 'text-xs border border-gray-200 rounded-lg px-2 py-1.5'

export interface ActeSuggere { tooth?: string | null; label: string; amount: number }

interface Ligne { tooth: string; code: string; label: string; amount: string }

interface Feuille {
  id: string
  care_date: string
  total: number
  status: StatutFeuille
  insurer: string | null
  items?: { id: string; tooth: string | null; code: string | null; label: string; amount: number }[]
}

export default function FeuilleSoinsCard({
  patientId, appointmentId = null, dental = false, mutuelle = null, suggestions = [],
}: {
  patientId: string
  appointmentId?: string | null
  /** Dentiste : la colonne « dent » n'a de sens que là. */
  dental?: boolean
  /** Organisme de la fiche patient, repris tel quel sur la feuille. */
  mutuelle?: string | null
  /** Actes du jour, pré-remplis : le praticien relit au lieu de ressaisir. */
  suggestions?: ActeSuggere[]
}) {
  const [feuilles, setFeuilles] = useState<Feuille[]>([])
  const [activee, setActivee] = useState(true)
  const [actes, setActes] = useState<{ label: string; code: string | null; amount: number }[]>([])
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [busy, setBusy] = useState(false)
  const [ouvert, setOuvert] = useState(false)

  const charger = useCallback(async () => {
    const res = await fetch(`/api/feuilles-soins?patient_id=${patientId}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return
    setFeuilles(data.feuilles ?? [])
    setActivee(data.activee !== false)
  }, [patientId])

  useEffect(() => { charger() }, [charger])
  useEffect(() => {
    fetch('/api/feuilles-soins/actes')
      .then((r) => (r.ok ? r.json() : { actes: [] }))
      .then((d) => setActes(d.actes ?? []))
      .catch(() => { /* catalogue vide : on saisit à la main */ })
  }, [])

  /** Première ouverture : les actes du jour deviennent les lignes. */
  function ouvrir() {
    setOuvert(true)
    if (lignes.length > 0) return
    const depart: Ligne[] = suggestions.map((s) => {
      const connu = actes.find((a) => a.label.toLowerCase() === s.label.toLowerCase())
      return {
        tooth: s.tooth ?? '',
        code: connu?.code ?? '',
        label: s.label,
        amount: String(s.amount || connu?.amount || ''),
      }
    })
    setLignes(depart.length > 0 ? depart : [{ tooth: '', code: '', label: '', amount: '' }])
  }

  function majLigne(i: number, champ: keyof Ligne, valeur: string) {
    setLignes((prev) => prev.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)))
  }

  /** Acte choisi dans le catalogue : code et montant suivent, sans écraser ce
   *  que le praticien a déjà tapé. */
  function choisirActe(i: number, label: string) {
    setLignes((prev) => prev.map((l, j) => {
      if (j !== i) return l
      const connu = actes.find((a) => a.label.toLowerCase().replace(/\s+/g, ' ') === label.trim().toLowerCase().replace(/\s+/g, ' '))
      return {
        ...l,
        label,
        code: l.code || connu?.code || '',
        amount: l.amount || (connu ? String(connu.amount) : ''),
      }
    }))
  }

  async function etablir() {
    const items = lignes
      .filter((l) => l.label.trim())
      .map((l) => ({ tooth: l.tooth || null, code: l.code || null, label: l.label.trim(), amount: Number(String(l.amount || '0').replace(',', '.')) }))
    if (items.length === 0) { alert('Ajoutez au moins un acte.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/feuilles-soins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, appointment_id: appointmentId, items }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || "La feuille n'a pas pu être établie."); return }
      setLignes([]); setOuvert(false)
      await charger()
      // Le document s'ouvre tout de suite : c'est pour l'imprimer qu'on l'établit.
      window.open(`/feuille-soins/${data.id}`, '_blank', 'noopener')
    } finally {
      setBusy(false)
    }
  }

  async function changerStatut(f: Feuille, status: StatutFeuille) {
    const res = await fetch(`/api/feuilles-soins/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (res.ok) setFeuilles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status } : x)))
  }

  async function supprimer(f: Feuille) {
    if (!confirm('Supprimer cette feuille de soins ?')) return
    const res = await fetch(`/api/feuilles-soins/${f.id}`, { method: 'DELETE' })
    if (res.ok) setFeuilles((prev) => prev.filter((x) => x.id !== f.id))
  }

  if (!activee) return null

  const total = totalFeuille(lignes.map((l) => ({ amount: l.amount })))

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <FileSpreadsheet className="h-4 w-4" /> Feuille de soins
          {mutuelle && <span className="text-[11px] font-medium text-gray-400">· {mutuelle}</span>}
        </h3>
        {!ouvert && (
          <Button size="sm" variant="outline" onClick={ouvrir}>
            <Plus className="h-4 w-4 mr-1" /> Établir
          </Button>
        )}
      </div>

      {ouvert && (
        <div className="space-y-2 mb-4">
          {lignes.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              {dental && (
                <select value={l.tooth} onChange={(e) => majLigne(i, 'tooth', e.target.value)}
                  className={`${inputCls} w-[72px] bg-white`} title="Dent (FDI)">
                  <option value="">Dent</option>
                  <optgroup label="Haut">{FDI_UPPER.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                  <optgroup label="Bas">{FDI_LOWER.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                  <optgroup label="Lait — haut">{FDI_UPPER_LAIT.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                  <optgroup label="Lait — bas">{FDI_LOWER_LAIT.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                </select>
              )}
              <input value={l.label} onChange={(e) => choisirActe(i, e.target.value)} placeholder="Acte"
                list="feuille-actes" autoComplete="off" className={`${inputCls} flex-1 min-w-[140px]`} />
              <input value={l.code} onChange={(e) => majLigne(i, 'code', e.target.value.toUpperCase())}
                placeholder="Code" title="Code de nomenclature, tel que vous l'écrivez sur vos feuilles"
                className={`${inputCls} w-24 uppercase`} />
              <input value={l.amount} onChange={(e) => majLigne(i, 'amount', e.target.value)} type="number" min="0"
                placeholder="DH" className={`${inputCls} w-20`} />
              <button onClick={() => setLignes((prev) => prev.filter((_, j) => j !== i))}
                className="text-gray-300 hover:text-red-500" title="Retirer cette ligne">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <datalist id="feuille-actes">
            {actes.map((a) => (
              <option key={a.label} value={a.label}>{a.code ? `${a.code} · ` : ''}{a.amount} DH</option>
            ))}
          </datalist>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button onClick={() => setLignes((prev) => [...prev, { tooth: '', code: '', label: '', amount: '' }])}
              className="text-xs font-medium text-primary-600 hover:text-primary-700">＋ Ajouter un acte</button>
            <span className="text-sm font-semibold text-gray-800">Total {total.toLocaleString('fr-FR')} DH</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={etablir} disabled={busy}>
              {busy ? 'Établissement…' : 'Établir et imprimer'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOuvert(false)}>Annuler</Button>
          </div>
          <p className="text-[11px] text-gray-400">
            Le code est celui que vous portez sur vos feuilles : saisi une fois, il revient tout seul avec l&apos;acte.
          </p>
        </div>
      )}

      {feuilles.length === 0 ? (
        !ouvert && <p className="text-xs text-gray-400 italic">Aucune feuille établie pour ce patient.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {feuilles.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2">
              <span className="text-sm text-gray-600 shrink-0">{formatDateShort(f.care_date)}</span>
              <span className="text-xs text-gray-400 truncate flex-1">
                {(f.items ?? []).length} acte{(f.items ?? []).length > 1 ? 's' : ''}
                {f.insurer ? ` · ${f.insurer}` : ''}
              </span>
              <span className="text-sm font-semibold text-gray-800 shrink-0">{Number(f.total).toLocaleString('fr-FR')} DH</span>
              <select value={f.status} onChange={(e) => changerStatut(f, e.target.value as StatutFeuille)}
                className="text-[11px] border border-gray-200 rounded-lg px-1.5 py-1 bg-white shrink-0">
                {STATUTS_FEUILLE.map((s) => <option key={s} value={s}>{STATUT_FEUILLE_LABELS[s]}</option>)}
              </select>
              <a href={`/feuille-soins/${f.id}`} target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-primary-600 shrink-0" title="Imprimer">
                <Printer className="h-4 w-4" />
              </a>
              <button onClick={() => supprimer(f)} className="text-gray-300 hover:text-red-500 shrink-0" title="Supprimer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
