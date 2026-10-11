'use client'

// Travaux de laboratoire — suivi d'un patient.
//
// CE QUE CET ÉCRAN DOIT EMPÊCHER
//
// Que la couronne ne soit pas revenue le jour de la pose. Tout est donc
// organisé autour d'une seule date — le RETOUR ATTENDU — et d'un seul signal :
// le rouge quand elle est passée. Le reste (teinte, matériau, instructions) ne
// sert qu'au bon de travail qui part chez le prothésiste.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import { FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT } from '@/lib/dental'
import {
  LAB_STATUTS, LAB_STATUT_LABELS, LAB_STATUT_COULEURS, LAB_TYPES,
  enRetard, titreTravail, type LabStatut, type LabWork,
} from '@/lib/labo'
import { FlaskConical, Plus, Printer, Trash2, X } from 'lucide-react'

const inputCls = 'text-xs border border-gray-200 rounded-lg px-2 py-1.5'

interface ActeDevis { id: string; label: string; tooth: string | null; quote: string }

export default function LabWorksCard({
  patientId,
  rdvs = [],
}: {
  patientId: string
  /** Rendez-vous à venir : celui de la POSE, qui donne son sens à l'alerte. */
  rdvs?: { id: string; date: string; time: string }[]
}) {
  const aujourdhui = getNowInMaroc().toISOString().slice(0, 10)

  const [travaux, setTravaux] = useState<LabWork[]>([])
  const [activee, setActivee] = useState(true)
  const [actes, setActes] = useState<ActeDevis[]>([])
  const [labosConnus, setLabosConnus] = useState<string[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [busy, setBusy] = useState(false)

  // Saisie d'un nouveau travail
  const [type, setType] = useState('')
  const [dents, setDents] = useState<string[]>([])
  const [labo, setLabo] = useState('')
  const [teinte, setTeinte] = useState('')
  const [matiere, setMatiere] = useState('')
  const [instructions, setInstructions] = useState('')
  const [retour, setRetour] = useState('')
  const [acteId, setActeId] = useState('')
  const [rdvPose, setRdvPose] = useState('')

  const charger = useCallback(async () => {
    const res = await fetch(`/api/lab-works?patient_id=${patientId}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return
    const liste = (data.travaux ?? []) as LabWork[]
    setTravaux(liste)
    setActivee(data.activee !== false)
    // Carnet de laboratoires : ceux que ce cabinet a déjà utilisés. Rien à
    // paramétrer, comme pour les actes et les codes.
    setLabosConnus(Array.from(new Set(liste.map((t) => t.lab_name).filter((n): n is string => !!n))))
  }, [patientId])

  useEffect(() => { charger() }, [charger])

  // Les actes du devis, pour le rattachement facultatif.
  useEffect(() => {
    fetch(`/api/quotes?patient_id=${patientId}`)
      .then((r) => (r.ok ? r.json() : { quotes: [] }))
      .then((d) => {
        const lignes: ActeDevis[] = []
        for (const q of d.quotes ?? []) {
          for (const it of q.items ?? []) {
            lignes.push({ id: it.id, label: it.label, tooth: it.tooth, quote: q.label || 'Devis' })
          }
        }
        setActes(lignes)
      })
      .catch(() => { /* sans devis, le travail se saisit à la main */ })
  }, [patientId])

  function choisirActe(id: string) {
    setActeId(id)
    const a = actes.find((x) => x.id === id)
    if (!a) return
    // Le devis sait déjà quel acte sur quelle dent : on ne le retape pas.
    if (!type) setType(a.label)
    if (a.tooth && !dents.includes(a.tooth)) setDents((p) => [...p, a.tooth as string])
  }

  async function creer() {
    if (!type.trim() && dents.length === 0) { alert('Indiquez au moins le type de travail.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/lab-works', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          quote_item_id: acteId || null,
          appointment_id: rdvPose || null,
          work_type: type, teeth: dents, lab_name: labo, shade: teinte,
          material: matiere, instructions, due_at: retour || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || "Le travail n'a pas pu être enregistré."); return }
      setType(''); setDents([]); setTeinte(''); setMatiere(''); setInstructions('')
      setRetour(''); setActeId(''); setRdvPose(''); setOuvert(false)
      await charger()
    } finally { setBusy(false) }
  }

  async function majTravail(t: LabWork, patch: Record<string, unknown>) {
    const res = await fetch(`/api/lab-works/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || 'Modification impossible.'); return }
    setTravaux((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...data } : x)))
  }

  async function enCompta(t: LabWork) {
    if (!confirm(`Ajouter ${t.cost} DH aux dépenses du cabinet ?`)) return
    const res = await fetch(`/api/lab-works/${t.id}/compta`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || 'Ajout impossible.'); return }
    setTravaux((prev) => prev.map((x) => (x.id === t.id ? data.travail : x)))
  }

  async function supprimer(t: LabWork) {
    if (!confirm('Supprimer ce travail de laboratoire ?')) return
    const res = await fetch(`/api/lab-works/${t.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || 'Suppression impossible.'); return }
    setTravaux((prev) => prev.filter((x) => x.id !== t.id))
  }

  if (!activee) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <FlaskConical className="h-4 w-4" /> Laboratoire
        </h3>
        {!ouvert && (
          <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau travail
          </Button>
        )}
      </div>

      {ouvert && (
        <div className="space-y-2 mb-4 border border-gray-100 rounded-lg p-3">
          {actes.length > 0 && (
            <select value={acteId} onChange={(e) => choisirActe(e.target.value)} className={`${inputCls} w-full bg-white`}>
              <option value="">Rattacher à un acte du devis (facultatif)</option>
              {actes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tooth ? `${a.tooth} · ` : ''}{a.label} — {a.quote}
                </option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap gap-1.5">
            <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Type de travail"
              list="labo-types" className={`${inputCls} flex-1 min-w-[150px]`} />
            <datalist id="labo-types">{LAB_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            <input value={labo} onChange={(e) => setLabo(e.target.value)} placeholder="Laboratoire"
              list="labo-noms" className={`${inputCls} flex-1 min-w-[130px]`} />
            <datalist id="labo-noms">{labosConnus.map((n) => <option key={n} value={n} />)}</datalist>
          </div>

          {/* Dents : on ajoute, on retire. Un bridge en porte plusieurs. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <select value="" onChange={(e) => { if (e.target.value && !dents.includes(e.target.value)) setDents((p) => [...p, e.target.value]) }}
              className={`${inputCls} w-24 bg-white`}>
              <option value="">+ Dent</option>
              <optgroup label="Haut">{FDI_UPPER.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
              <optgroup label="Bas">{FDI_LOWER.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
              <optgroup label="Lait — haut">{FDI_UPPER_LAIT.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
              <optgroup label="Lait — bas">{FDI_LOWER_LAIT.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
            </select>
            {dents.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-700 bg-primary-50 rounded px-2 py-1">
                {d}
                <button onClick={() => setDents((p) => p.filter((x) => x !== d))} className="text-primary-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <input value={teinte} onChange={(e) => setTeinte(e.target.value)} placeholder="Teinte (ex. A2)" className={`${inputCls} w-32`} />
            <input value={matiere} onChange={(e) => setMatiere(e.target.value)} placeholder="Matériau" className={`${inputCls} flex-1 min-w-[120px]`} />
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
              Retour attendu
              <input type="date" value={retour} onChange={(e) => setRetour(e.target.value)} className={inputCls} />
            </label>
          </div>

          {rdvs.length > 0 && (
            <select value={rdvPose} onChange={(e) => setRdvPose(e.target.value)} className={`${inputCls} w-full bg-white`}>
              <option value="">Rendez-vous de pose (facultatif)</option>
              {rdvs.map((r) => (
                <option key={r.id} value={r.id}>{formatDateShort(r.date)} · {String(r.time).substring(0, 5)}</option>
              ))}
            </select>
          )}

          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2}
            placeholder="Instructions au prothésiste" className={`${inputCls} w-full resize-none`} />

          <div className="flex gap-2">
            <Button size="sm" onClick={creer} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
            <Button size="sm" variant="outline" onClick={() => setOuvert(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {travaux.length === 0 ? (
        !ouvert && <p className="text-xs text-gray-400 italic">Aucun travail de laboratoire pour ce patient.</p>
      ) : (
        <ul className="space-y-2">
          {travaux.map((t) => {
            const retardé = enRetard(t, aujourdhui)
            return (
              <li key={t.id} className={`rounded-lg border p-2.5 ${retardé ? 'border-red-200 bg-red-50/50' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{titreTravail(t)}</span>
                  {t.lab_name && <span className="text-[11px] text-gray-400">{t.lab_name}</span>}
                  <select
                    value={t.status}
                    onChange={(e) => majTravail(t, { status: e.target.value as LabStatut })}
                    className={`text-[11px] rounded-full px-2 py-0.5 border-0 ${LAB_STATUT_COULEURS[t.status]}`}
                  >
                    {LAB_STATUTS.map((s) => <option key={s} value={s}>{LAB_STATUT_LABELS[s]}</option>)}
                  </select>
                  <a href={`/labo/${t.id}`} target="_blank" rel="noopener noreferrer"
                    className="ml-auto text-gray-400 hover:text-primary-600" title="Bon de travail">
                    <Printer className="h-4 w-4" />
                  </a>
                  <button onClick={() => supprimer(t)} className="text-gray-300 hover:text-red-500" title="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[11px]">
                  <label className="flex items-center gap-1 text-gray-500">
                    Retour
                    <input type="date" value={t.due_at ?? ''} onChange={(e) => majTravail(t, { due_at: e.target.value })}
                      className="border border-gray-200 rounded px-1.5 py-0.5" />
                  </label>
                  {retardé && <span className="font-semibold text-red-600">en retard</span>}
                  {t.received_at && <span className="text-green-600">reçu le {formatDateShort(t.received_at)}</span>}

                  <label className="flex items-center gap-1 text-gray-500 ml-auto">
                    Coût labo
                    <input type="number" min="0" value={t.cost ?? ''} placeholder="DH"
                      onChange={(e) => majTravail(t, { cost: e.target.value })}
                      className="w-20 border border-gray-200 rounded px-1.5 py-0.5" />
                  </label>
                  {t.cost_expense_id ? (
                    <span className="text-green-600 font-medium">en comptabilité</span>
                  ) : (
                    <button onClick={() => enCompta(t)} disabled={!t.cost}
                      className="font-medium text-primary-600 hover:text-primary-700 disabled:text-gray-300">
                      Ajouter à la compta
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
