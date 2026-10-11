'use client'

// Orthodontie — un traitement se mesure en MOIS.
//
// L'écran répond à trois questions, et à rien d'autre : où en est-on sur la
// durée annoncée, quand est la prochaine séance, et qu'a-t-on fait la dernière
// fois. Le reste — le prix, l'échéancier — vit dans le devis : deux endroits
// pour la même somme finissent toujours par diverger.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  ORTHO_APPAREILS, ORTHO_ACTES, ORTHO_ARCADES, ORTHO_STATUTS,
  ORTHO_STATUT_LABELS, ORTHO_STATUT_COULEURS,
  avancement, prochaineSeance, seanceEnRetard,
  type OrthoStatut, type OrthoTraitement,
} from '@/lib/ortho'
import { Braces, Plus, Printer, Trash2 } from 'lucide-react'

const inputCls = 'text-xs border border-gray-200 rounded-lg px-2 py-1.5'

export default function OrthoCard({ patientId }: { patientId: string }) {
  const aujourdhui = getNowInMaroc().toISOString().slice(0, 10)

  const [traitements, setTraitements] = useState<OrthoTraitement[]>([])
  const [activee, setActivee] = useState(true)
  const [nouveau, setNouveau] = useState(false)
  const [busy, setBusy] = useState(false)

  // Ouverture d'un traitement
  const [appareil, setAppareil] = useState('')
  const [arcades, setArcades] = useState('deux')
  const [debut, setDebut] = useState(aujourdhui)
  const [duree, setDuree] = useState('18')
  const [diagnostic, setDiagnostic] = useState('')

  // Séance en cours de saisie, par traitement
  const [seanceDe, setSeanceDe] = useState<string | null>(null)
  const [sDate, setSDate] = useState(aujourdhui)
  const [sActe, setSActe] = useState('Activation')
  const [sArc, setSArc] = useState('')
  const [sProchaine, setSProchaine] = useState('')
  const [sNotes, setSNotes] = useState('')

  const charger = useCallback(async () => {
    const res = await fetch(`/api/ortho?patient_id=${patientId}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return
    setTraitements(data.traitements ?? [])
    setActivee(data.activee !== false)
  }, [patientId])

  useEffect(() => { charger() }, [charger])

  async function ouvrir() {
    if (!appareil.trim()) { alert("Indiquez l'appareil posé.") ; return }
    setBusy(true)
    try {
      const res = await fetch('/api/ortho', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId, appliance: appareil, arches: arcades,
          started_on: debut || null, planned_months: Number(duree) || null, diagnosis: diagnostic,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || "Le traitement n'a pas pu être ouvert."); return }
      setAppareil(''); setDiagnostic(''); setNouveau(false)
      await charger()
    } finally { setBusy(false) }
  }

  async function majTraitement(t: OrthoTraitement, patch: Record<string, unknown>) {
    const res = await fetch(`/api/ortho/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || 'Modification impossible.'); return }
    setTraitements((prev) => prev.map((x) => (x.id === t.id ? data : x)))
  }

  async function ajouterSeance(t: OrthoTraitement) {
    setBusy(true)
    try {
      const res = await fetch(`/api/ortho/${t.id}/visits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_date: sDate, act: sActe, wire: sArc, next_visit: sProchaine || null, notes: sNotes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || "La séance n'a pas pu être enregistrée."); return }
      setSeanceDe(null); setSArc(''); setSProchaine(''); setSNotes('')
      await charger()
    } finally { setBusy(false) }
  }

  async function supprimerSeance(t: OrthoTraitement, visiteId: string) {
    if (!confirm('Supprimer cette séance ?')) return
    const res = await fetch(`/api/ortho/${t.id}/visits?visit_id=${visiteId}`, { method: 'DELETE' })
    if (res.ok) await charger()
  }

  async function supprimerTraitement(t: OrthoTraitement) {
    if (!confirm('Supprimer ce traitement et toutes ses séances ?')) return
    const res = await fetch(`/api/ortho/${t.id}`, { method: 'DELETE' })
    if (res.ok) setTraitements((prev) => prev.filter((x) => x.id !== t.id))
  }

  if (!activee) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <Braces className="h-4 w-4" /> Orthodontie
        </h3>
        {!nouveau && (
          <Button size="sm" variant="outline" onClick={() => setNouveau(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau traitement
          </Button>
        )}
      </div>

      {nouveau && (
        <div className="space-y-2 mb-4 border border-gray-100 rounded-lg p-3">
          <div className="flex flex-wrap gap-1.5">
            <input value={appareil} onChange={(e) => setAppareil(e.target.value)} placeholder="Appareil posé"
              list="ortho-appareils" className={`${inputCls} flex-1 min-w-[160px]`} />
            <datalist id="ortho-appareils">{ORTHO_APPAREILS.map((a) => <option key={a} value={a} />)}</datalist>
            <select value={arcades} onChange={(e) => setArcades(e.target.value)} className={`${inputCls} bg-white`}>
              {ORTHO_ARCADES.map((a) => <option key={a.cle} value={a.cle}>{a.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Pose le <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className={inputCls} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Durée annoncée
              <input type="number" min="1" max="72" value={duree} onChange={(e) => setDuree(e.target.value)}
                className={`${inputCls} w-16`} /> mois
            </label>
          </div>
          <textarea value={diagnostic} onChange={(e) => setDiagnostic(e.target.value)} rows={2}
            placeholder="Diagnostic et objectifs" className={`${inputCls} w-full resize-none`} />
          <div className="flex gap-2">
            <Button size="sm" onClick={ouvrir} disabled={busy}>{busy ? 'Ouverture…' : 'Ouvrir le traitement'}</Button>
            <Button size="sm" variant="outline" onClick={() => setNouveau(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {traitements.length === 0 ? (
        !nouveau && <p className="text-xs text-gray-400 italic">Aucun traitement orthodontique.</p>
      ) : (
        <div className="space-y-3">
          {traitements.map((t) => {
            const av = avancement(t, aujourdhui)
            const prochaine = prochaineSeance(t.visits)
            const retard = seanceEnRetard(t, aujourdhui)
            const visites = (t.visits ?? []).slice().sort((a, b) => b.visit_date.localeCompare(a.visit_date))
            return (
              <div key={t.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{t.appliance || 'Traitement'}</span>
                  {t.arches && (
                    <span className="text-[11px] text-gray-400">
                      {ORTHO_ARCADES.find((a) => a.cle === t.arches)?.label}
                    </span>
                  )}
                  <select
                    value={t.status}
                    onChange={(e) => majTraitement(t, { status: e.target.value as OrthoStatut })}
                    className={`text-[11px] rounded-full px-2 py-0.5 border-0 ${ORTHO_STATUT_COULEURS[t.status]}`}
                  >
                    {ORTHO_STATUTS.map((s) => <option key={s} value={s}>{ORTHO_STATUT_LABELS[s]}</option>)}
                  </select>
                  <a href={`/ortho/${t.id}`} target="_blank" rel="noopener noreferrer"
                    className="ml-auto text-gray-400 hover:text-primary-600" title="Fiche de traitement">
                    <Printer className="h-4 w-4" />
                  </a>
                  <button onClick={() => supprimerTraitement(t)} className="text-gray-300 hover:text-red-500" title="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* « Mois 7 sur 18 » : la seule phrase que le patient retient. */}
                {av.mois !== null && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className={av.depasse ? 'font-semibold text-amber-700' : 'text-gray-600'}>
                        Mois {av.mois}{av.prevus ? ` sur ${av.prevus}` : ''}
                        {av.depasse && ' — durée annoncée dépassée'}
                      </span>
                      {av.finPrevue && <span className="text-gray-400">fin prévue {formatDateShort(av.finPrevue)}</span>}
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${av.depasse ? 'bg-amber-500' : 'bg-primary-500'}`}
                        style={{ width: `${av.pourcent ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2 text-[11px]">
                  {prochaine ? (
                    <span className={retard ? 'font-semibold text-red-600' : 'text-gray-600'}>
                      Prochaine séance {formatDateShort(prochaine)}{retard && ' — passée, le patient ne s\'est pas présenté'}
                    </span>
                  ) : (
                    <span className="text-gray-400">Aucune séance programmée</span>
                  )}
                  <button
                    onClick={() => { setSeanceDe(seanceDe === t.id ? null : t.id); setSDate(aujourdhui) }}
                    className="ml-auto font-medium text-primary-600 hover:text-primary-700"
                  >
                    {seanceDe === t.id ? 'Fermer' : '＋ Séance'}
                  </button>
                </div>

                {seanceDe === t.id && (
                  <div className="mt-2 space-y-1.5 bg-gray-50 rounded-lg p-2">
                    <div className="flex flex-wrap gap-1.5">
                      <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} className={inputCls} />
                      <input value={sActe} onChange={(e) => setSActe(e.target.value)} list="ortho-actes"
                        placeholder="Acte" className={`${inputCls} flex-1 min-w-[120px]`} />
                      <datalist id="ortho-actes">{ORTHO_ACTES.map((a) => <option key={a} value={a} />)}</datalist>
                      <input value={sArc} onChange={(e) => setSArc(e.target.value)} placeholder="Arc posé"
                        className={`${inputCls} w-28`} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        Prochaine séance
                        <input type="date" value={sProchaine} onChange={(e) => setSProchaine(e.target.value)} className={inputCls} />
                      </label>
                      <input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Note"
                        className={`${inputCls} flex-1 min-w-[120px]`} />
                      <Button size="sm" onClick={() => ajouterSeance(t)} disabled={busy}>Enregistrer</Button>
                    </div>
                  </div>
                )}

                {visites.length > 0 && (
                  <ul className="mt-2 divide-y divide-gray-50">
                    {visites.slice(0, 8).map((v) => (
                      <li key={v.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                        <span className="text-gray-400 shrink-0 tabular-nums">{formatDateShort(v.visit_date)}</span>
                        <span className="text-gray-800">{v.act || 'Séance'}</span>
                        {v.wire && <span className="text-gray-500">· {v.wire}</span>}
                        {v.notes && <span className="text-gray-400 truncate">· {v.notes}</span>}
                        <button onClick={() => supprimerSeance(t, v.id)}
                          className="ml-auto text-gray-300 hover:text-red-500 shrink-0" title="Supprimer">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-[10px] text-gray-400 mt-2">
                  Les photos d&apos;évolution se déposent dans l&apos;onglet Documents du dossier.
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
