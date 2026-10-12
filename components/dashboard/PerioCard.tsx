'use client'

// Parodonte — relevés datés et comparaison.
//
// LA SAISIE DOIT TENIR EN DEUX MINUTES, GANTS AUX MAINS
//
// Un relevé complet, c'est 192 chiffres : personne ne le saisit deux fois sur
// un écran. Le mode proposé ici est celui de l'omnipraticien — une poche par
// dent, un saignement, une mobilité — et il écrit dans la même structure que
// le relevé à six sites (voir migration v69), pour que les deux se comparent.
//
// CE QUI FAIT LA VALEUR N'EST PAS LE RELEVÉ, C'EST L'ÉCART
//
// « 16 : 6 mm en mars, 3 mm en octobre » est la seule phrase qui fasse
// accepter la suite d'un traitement parodontal. D'où la comparaison affichée
// avant la liste, et jamais de modification d'un relevé déjà enregistré.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateShort } from '@/lib/utils'
import { FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT } from '@/lib/dental'
import {
  resumer, comparerDent, lireDent, dentsMesurees, couleurPoche, MOBILITES,
  POCHE_PATHOLOGIQUE, type PerioTeeth,
} from '@/lib/perio'
import { Activity, Plus, Printer, Trash2 } from 'lucide-react'

interface Releve {
  id: string
  charted_at: string
  mode: 'simple' | 'complet'
  teeth: PerioTeeth
  plaque_index: number | null
  notes: string | null
}

const COULEURS = {
  ok: 'border-green-300 text-green-700',
  surveiller: 'border-amber-300 text-amber-700 bg-amber-50',
  atteinte: 'border-red-300 text-red-700 bg-red-50',
}

export default function PerioCard({ patientId }: { patientId: string }) {
  const [releves, setReleves] = useState<Releve[]>([])
  const [activee, setActivee] = useState(true)
  const [ouvert, setOuvert] = useState(false)
  const [busy, setBusy] = useState(false)

  // Saisie en cours
  const [saisie, setSaisie] = useState<PerioTeeth>({})
  const [plaque, setPlaque] = useState('')
  const [notes, setNotes] = useState('')
  const [avecLait, setAvecLait] = useState(false)

  const charger = useCallback(async () => {
    const res = await fetch(`/api/perio?patient_id=${patientId}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return
    setReleves(data.releves ?? [])
    setActivee(data.activee !== false)
  }, [patientId])

  useEffect(() => { charger() }, [charger])

  function majDent(dent: string, champ: 'pdMax' | 'bop' | 'mob', valeur: unknown) {
    setSaisie((prev) => {
      const courant = { ...(prev[dent] ?? {}) }
      if (champ === 'pdMax') {
        const n = Number(valeur)
        if (valeur === '' || !Number.isFinite(n)) delete courant.pdMax
        else courant.pdMax = Math.min(20, Math.max(0, Math.round(n)))
      } else if (champ === 'bop') {
        courant.bop = valeur === true
      } else {
        const m = Number(valeur)
        if (valeur === '' || !Number.isFinite(m)) delete courant.mob
        else courant.mob = m
      }
      const vide = courant.pdMax === undefined && courant.bop !== true && !courant.mob
      const next = { ...prev }
      if (vide) delete next[dent]
      else next[dent] = courant
      return next
    })
  }

  async function enregistrer() {
    if (Object.keys(saisie).length === 0) { alert('Relevez au moins une dent.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/perio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, mode: 'simple', teeth: saisie, plaque_index: plaque || null, notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || "Le relevé n'a pas pu être enregistré."); return }
      setSaisie({}); setPlaque(''); setNotes(''); setOuvert(false)
      await charger()
    } finally { setBusy(false) }
  }

  async function supprimer(r: Releve) {
    if (!confirm(`Supprimer le relevé du ${formatDateShort(r.charted_at)} ?`)) return
    const res = await fetch(`/api/perio/${r.id}`, { method: 'DELETE' })
    if (res.ok) setReleves((prev) => prev.filter((x) => x.id !== r.id))
  }

  if (!activee) return null

  const dernier = releves[0]
  const precedent = releves[1]

  // Dents dont la poche a bougé d'au moins 1 mm entre les deux derniers relevés.
  const evolutions = dernier && precedent
    ? Array.from(new Set([...dentsMesurees(precedent.teeth), ...dentsMesurees(dernier.teeth)]))
        .map((d) => ({ dent: d, ...comparerDent(precedent.teeth[d], dernier.teeth[d]) }))
        .filter((e) => e.evolution === 'amelioration' || e.evolution === 'aggravation')
        .sort((a, b) => (a.ecart ?? 0) - (b.ecart ?? 0))
    : []

  const Cellule = ({ n }: { n: number }) => {
    const dent = String(n)
    const d = saisie[dent]
    const mm = d?.pdMax ?? ''
    const couleur = couleurPoche(typeof mm === 'number' ? mm : null)
    return (
      <div className="flex flex-col items-center gap-0.5 w-[42px] shrink-0">
        {/* Le numéro bascule le saignement : un geste, pas une case de plus.
            Chaque contrôle PORTE SON NUMÉRO DE DENT : les 32 champs étaient
            rigoureusement anonymes (ni libellé, ni title, ni aria-label), si
            bien qu'à la tabulation — ou pour une synthèse vocale — plus rien ne
            disait quelle dent on était en train de sonder. */}
        <button
          type="button"
          onClick={() => majDent(dent, 'bop', d?.bop !== true)}
          aria-pressed={d?.bop === true}
          aria-label={`Dent ${n} — saignement au sondage`}
          title={`Dent ${n} — saignement au sondage`}
          className={`text-[10px] font-semibold w-full rounded px-1 ${d?.bop === true ? 'bg-red-500 text-white' : 'text-gray-400 hover:bg-gray-100'}`}
        >
          {n}
        </button>
        <input
          inputMode="numeric"
          value={mm}
          onChange={(e) => majDent(dent, 'pdMax', e.target.value)}
          placeholder="—"
          aria-label={`Dent ${n} — profondeur de poche en mm`}
          title={`Dent ${n} — profondeur de poche la plus profonde, en mm`}
          className={`w-full h-8 text-center text-sm rounded border ${couleur ? COULEURS[couleur] : 'border-gray-200 text-gray-700'}`}
        />
        {mm !== '' && (
          <select
            value={d?.mob ?? ''}
            onChange={(e) => majDent(dent, 'mob', e.target.value)}
            aria-label={`Dent ${n} — mobilité`}
            title={`Dent ${n} — mobilité`}
            className="w-full text-[10px] border border-gray-200 rounded bg-white text-gray-500"
          >
            <option value="">M</option>
            {MOBILITES.map((m) => <option key={m} value={m}>M{m}</option>)}
          </select>
        )}
      </div>
    )
  }

  const Arcade = ({ ids }: { ids: number[] }) => (
    <div className="flex justify-center gap-1">
      <div className="flex gap-1">{ids.slice(0, ids.length / 2).map((n) => <Cellule key={n} n={n} />)}</div>
      <div className="w-4 shrink-0 flex justify-center"><span className="border-l border-dashed border-gray-300 self-stretch" /></div>
      <div className="flex gap-1">{ids.slice(ids.length / 2).map((n) => <Cellule key={n} n={n} />)}</div>
    </div>
  )

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <Activity className="h-4 w-4" /> Parodonte
        </h3>
        {!ouvert && (
          <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau relevé
          </Button>
        )}
      </div>

      {ouvert && (
        <div className="space-y-3 mb-4 border border-gray-100 rounded-lg p-3">
          <p className="text-[11px] text-gray-500">
            Tapez la <b>poche la plus profonde</b> en mm. Cliquez le numéro de la dent pour marquer un
            <b> saignement</b>. La mobilité apparaît dès qu&apos;une poche est saisie.
          </p>

          <div className="overflow-x-auto pb-1 space-y-2">
            <Arcade ids={FDI_UPPER} />
            {avecLait && <Arcade ids={FDI_UPPER_LAIT} />}
            <div className="text-center text-[9px] text-gray-300 tracking-widest">— haut / bas —</div>
            {avecLait && <Arcade ids={FDI_LOWER_LAIT} />}
            <Arcade ids={FDI_LOWER} />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setAvecLait((v) => !v)} className="text-[11px] text-primary-600 hover:underline">
              {avecLait ? 'Masquer les dents de lait' : 'Afficher les dents de lait'}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
              Indice de plaque
              <input value={plaque} onChange={(e) => setPlaque(e.target.value)} type="number" min="0" max="100"
                className="w-16 text-sm border border-gray-200 rounded px-2 py-1" placeholder="%" />
            </label>
          </div>

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Observations (facultatif)"
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 resize-none" />

          <div className="flex gap-2">
            <Button size="sm" onClick={enregistrer} disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer le relevé'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOuvert(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {/* Comparaison : ce que le patient comprend du premier coup d'œil. */}
      {evolutions.length > 0 && (
        <div className="mb-3 rounded-lg bg-gray-50 p-3">
          <p className="text-[11px] font-semibold text-gray-500 mb-1.5">
            Depuis le relevé du {formatDateShort(precedent.charted_at)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {evolutions.map((e) => (
              <span
                key={e.dent}
                className={`text-[11px] font-medium rounded px-2 py-1 ${e.evolution === 'amelioration' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
              >
                {e.dent} : {e.avant} → {e.apres} mm
              </span>
            ))}
          </div>
        </div>
      )}

      {releves.length === 0 ? (
        !ouvert && <p className="text-xs text-gray-400 italic">Aucun relevé parodontal pour ce patient.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {releves.map((r) => {
            const res = resumer(r.teeth)
            return (
              <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="text-gray-600 shrink-0">{formatDateShort(r.charted_at)}</span>
                <span className="text-xs text-gray-400 truncate">
                  {res.dents} dent{res.dents > 1 ? 's' : ''}
                  {res.pocheMax !== null && ` · poche max ${res.pocheMax} mm`}
                  {res.bopPourcent !== null && ` · ${res.bopPourcent} % de saignement`}
                  {res.dentsAtteintes.length > 0 && ` · ${res.dentsAtteintes.length} ≥ ${POCHE_PATHOLOGIQUE} mm`}
                </span>
                <a href={`/parodonte/${r.id}`} target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-gray-400 hover:text-primary-600 shrink-0" title="Bilan imprimable">
                  <Printer className="h-4 w-4" />
                </a>
                <button onClick={() => supprimer(r)} className="text-gray-300 hover:text-red-500 shrink-0" title="Supprimer">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
