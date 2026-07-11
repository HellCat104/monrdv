'use client'

// Poste de consultation : 3 colonnes (dossier / note+constantes / actions).
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateFr } from '@/lib/utils'
import type { VitalDef } from '@/types'
import {
  ArrowLeft, HeartPulse, Pill, Activity, Check, Save, FileText, Wallet, Printer,
  AlertTriangle, CheckCircle2, Plus,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
interface Patient { id: string; first_name: string; last_name: string; age?: number | null; phone?: string | null; cin?: string | null; mutuelle?: string | null; allergies?: string | null; chronic_conditions?: string | null; current_treatments?: string | null }

export default function ConsultationClient({
  doctorId, appointmentId, appointmentPaid, amountPaid, hasInvoice, defaultPrice,
  patient, recentNotes, recentPrescriptions, consultationPrescriptions, recentVitals,
  existingNoteId, existingNote, vitalDefs, vitalDefsAll,
}: {
  doctorId: string
  appointmentId: string
  appointmentPaid: boolean
  amountPaid: number | null
  hasInvoice: boolean
  defaultPrice: number | null
  patient: Patient
  recentNotes: Row[]
  recentPrescriptions: Row[]
  consultationPrescriptions: Row[]
  recentVitals: Row[]
  existingNoteId: string | null
  existingNote: string
  vitalDefs: VitalDef[]
  vitalDefsAll: VitalDef[]
}) {
  const supabase = createClient()
  const router = useRouter()

  const [note, setNote] = useState(existingNote)
  const [noteId, setNoteId] = useState<string | null>(existingNoteId)
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [vitalInput, setVitalInput] = useState<Record<string, string>>({})
  const [vitals, setVitals] = useState<Row[]>(recentVitals)
  const [savingVital, setSavingVital] = useState(false)

  const [paid, setPaid] = useState(appointmentPaid)
  const [paidAmount, setPaidAmount] = useState<number | null>(amountPaid)
  const [payDue, setPayDue] = useState<string>(defaultPrice != null ? String(defaultPrice) : '')
  const [payPaid, setPayPaid] = useState<string>(defaultPrice != null ? String(defaultPrice) : '')
  const [payMethod, setPayMethod] = useState<string>('especes')
  const [payingNow, setPayingNow] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const vLabel = (k: string) => vitalDefsAll.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefsAll.find((v) => v.key === k)?.unit || ''

  const savingRef = useRef(false)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveNote = useCallback(async () => {
    if (!note.trim() || savingRef.current) return
    savingRef.current = true
    setNoteState('saving')
    try {
      if (noteId) {
        await supabase.from('consultation_notes').update({ note }).eq('id', noteId)
      } else {
        const { data } = await supabase
          .from('consultation_notes')
          .insert({ doctor_id: doctorId, patient_id: patient.id, appointment_id: appointmentId, note })
          .select('id').single()
        if (data) setNoteId(data.id)
      }
      setNoteState('saved')
      setTimeout(() => setNoteState((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } finally {
      savingRef.current = false
    }
  }, [note, noteId, appointmentId, patient.id, doctorId, supabase])

  // Enregistrement automatique : 1,5 s après la dernière frappe → rien n'est perdu
  useEffect(() => {
    if (!note.trim()) return
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => { saveNote() }, 1500)
    return () => { if (noteTimer.current) clearTimeout(noteTimer.current) }
  }, [note, saveNote])

  // Enregistre la note AVANT de quitter vers une autre action (ordonnance…)
  async function goTo(url: string) {
    if (noteTimer.current) clearTimeout(noteTimer.current)
    if (note.trim()) await saveNote()
    router.push(url)
  }

  async function saveVitals() {
    const values: Record<string, number> = {}
    for (const [k, v] of Object.entries(vitalInput)) {
      const n = parseFloat(v.replace(',', '.'))
      if (Number.isFinite(n)) values[k] = n
    }
    if (Object.keys(values).length === 0) return
    setSavingVital(true)
    const { data } = await supabase
      .from('vital_signs')
      .insert({ doctor_id: doctorId, patient_id: patient.id, values })
      .select('id, values, measured_at').single()
    setSavingVital(false)
    if (data) { setVitals((prev) => [data, ...prev]); setVitalInput({}) }
  }

  async function encaisser() {
    const paidVal = parseFloat(payPaid.replace(',', '.'))
    if (!Number.isFinite(paidVal) || paidVal < 0) { alert('Entrez un montant encaissé valide.'); return }
    const dueVal = payDue.trim() === '' ? paidVal : parseFloat(payDue.replace(',', '.'))
    if (!Number.isFinite(dueVal) || dueVal < 0) { alert('Total dû invalide.'); return }
    setPayingNow(true)
    const { error } = await supabase
      .from('appointments')
      .update({ amount_paid: paidVal, amount_due: dueVal, payment_method: payMethod, paid_at: new Date().toISOString() })
      .eq('id', appointmentId)
    setPayingNow(false)
    if (!error) { setPaid(true); setPaidAmount(paidVal) }
    else alert('L\'encaissement a échoué. Réessayez.')
  }

  // Clôture le RDV : note enregistrée, patient marqué présent et « parti »
  async function terminer() {
    setFinishing(true)
    try {
      if (note.trim()) await saveNote()
      await supabase
        .from('appointments')
        .update({ attendance: 'present', queue_status: 'parti' })
        .eq('id', appointmentId)
      router.push('/appointments')
      router.refresh()
    } catch {
      setFinishing(false)
      alert('La clôture a échoué. Réessayez.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Barre du haut */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/appointments')} className="text-gray-400 hover:text-gray-600" title="Retour à l'agenda">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {patient.first_name} {patient.last_name}
              {patient.age != null && <span className="text-gray-400 font-normal text-base"> · {patient.age} ans</span>}
            </h1>
            <p className="text-xs text-gray-500">Consultation en cours</p>
          </div>
        </div>
        <Button onClick={terminer} disabled={finishing}>
          <CheckCircle2 className="h-4 w-4 mr-1.5" /> {finishing ? 'Clôture…' : 'Terminer la consultation'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── Colonne gauche : dossier ─────────────────────────────── */}
        <aside className="lg:col-span-4 space-y-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4 text-sm space-y-2">
            <p className="text-gray-600">📞 {patient.phone || '—'}</p>
            {patient.cin && <p className="text-gray-500 text-xs">CIN : {patient.cin}</p>}
            {patient.mutuelle && <p className="text-gray-500 text-xs">Mutuelle : {patient.mutuelle}</p>}
            {patient.allergies && (
              <p className="text-red-600 flex items-start gap-1.5 bg-red-50 rounded-lg px-2.5 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span><b>Allergies :</b> {patient.allergies}</span>
              </p>
            )}
            {patient.chronic_conditions && <p className="text-gray-700"><b>Antécédents :</b> {patient.chronic_conditions}</p>}
            {patient.current_treatments && <p className="text-gray-700"><b>Traitements :</b> {patient.current_treatments}</p>}
          </div>

          {vitals.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Dernières constantes</h3>
              {vitals.slice(0, 3).map((m) => (
                <div key={m.id} className="text-xs text-gray-600 mb-1.5">
                  <span className="text-gray-400">{formatDateFr(m.measured_at)} — </span>
                  {Object.entries((m.values ?? {}) as Record<string, number>).map(([k, val]) => `${vLabel(k)} ${val}${vUnit(k) ? ' ' + vUnit(k) : ''}`).join(' · ')}
                </div>
              ))}
            </div>
          )}

          {recentNotes.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><HeartPulse className="h-3.5 w-3.5" /> Notes précédentes</h3>
              {recentNotes.filter((n) => n.id !== noteId).slice(0, 3).map((n) => (
                <div key={n.id} className="text-xs text-gray-600 mb-2 border-l-2 border-gray-100 pl-2">
                  <p className="text-gray-400">{formatDateFr(n.created_at)}</p>
                  <p className="line-clamp-3 whitespace-pre-wrap">{n.note}</p>
                </div>
              ))}
            </div>
          )}

          {recentPrescriptions.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Ordonnances récentes</h3>
              {recentPrescriptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goTo(`/ordonnance/p/${p.id}?back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
                  className="block w-full text-left text-xs text-gray-600 hover:text-primary-600 mb-1.5 border-l-2 border-gray-100 hover:border-primary-300 pl-2"
                  title="Modifier cette ordonnance"
                >
                  <span className="text-gray-400">{formatDateFr(p.created_at)} · modifier</span>
                  <span className="block line-clamp-1 whitespace-pre-wrap">{p.content}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ── Colonne centrale : note + constantes ──────────────────── */}
        <section className="lg:col-span-5 space-y-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Note de consultation</h3>
              <div className="flex items-center gap-2">
                {noteState === 'saved' && <span className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Enregistrée</span>}
                <Button variant="outline" size="sm" onClick={saveNote} disabled={noteState === 'saving' || !note.trim()}>
                  <Save className="h-4 w-4 mr-1" /> {noteState === 'saving' ? '…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motif, examen clinique, diagnostic, conduite à tenir…"
              rows={14}
              className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          {/* Ordonnances de cette consultation (plusieurs possibles) */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Pill className="h-4 w-4 text-primary-500" /> Ordonnances de la consultation ({consultationPrescriptions.length})
              </h3>
              <Button
                variant="outline" size="sm"
                onClick={() => goTo(`/ordonnance/${appointmentId}?new=1&back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
              >
                <Plus className="h-4 w-4 mr-1" /> Nouvelle
              </Button>
            </div>
            {consultationPrescriptions.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Aucune ordonnance. Cliquez « Nouvelle » pour en rédiger une (vous pouvez en faire plusieurs).</p>
            ) : (
              <div className="space-y-1.5">
                {consultationPrescriptions.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => goTo(`/ordonnance/p/${p.id}?back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
                    className="w-full text-left flex items-start gap-2 rounded-lg border border-gray-100 hover:border-primary-300 hover:bg-primary-50/40 p-2.5 transition-colors"
                    title="Modifier cette ordonnance"
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-[11px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-xs text-gray-800 line-clamp-2 whitespace-pre-wrap">{p.content}</span>
                      <span className="block text-[11px] text-primary-500 mt-0.5">Modifier</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {vitalDefs.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Activity className="h-4 w-4 text-primary-500" /> Constantes du jour</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                {vitalDefs.map((v) => (
                  <div key={v.key} className="relative">
                    <Input
                      type="number" step={v.step ?? 'any'} inputMode="decimal"
                      value={vitalInput[v.key] ?? ''}
                      onChange={(e) => setVitalInput((prev) => ({ ...prev, [v.key]: e.target.value }))}
                      placeholder={v.label} className="pr-10 text-sm" aria-label={v.label}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{v.unit}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={saveVitals} disabled={savingVital}>
                <Plus className="h-4 w-4 mr-1" /> {savingVital ? 'Enregistrement…' : 'Enregistrer les constantes'}
              </Button>
            </div>
          )}
        </section>

        {/* ── Colonne droite : actions ─────────────────────────────── */}
        <aside className="lg:col-span-3 space-y-2">
          <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2 sticky top-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Actions</p>

            <button onClick={() => goTo(`/ordonnance/${appointmentId}?new=1&back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
              <Pill className="h-4 w-4 text-primary-500" /> Nouvelle ordonnance
            </button>

            <button onClick={() => goTo(`/patients?certificat=${patient.id}`)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
              <FileText className="h-4 w-4 text-primary-500" /> Certificat
            </button>

            {paid ? (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                  <Check className="h-4 w-4" /> Encaissé{paidAmount != null ? ` · ${paidAmount} DH` : ''}
                </div>
                <a href={`/facture/${appointmentId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                  <Printer className="h-4 w-4 text-primary-500" /> Facture
                </a>
              </>
            ) : (
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-green-500" /> Encaisser</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500">Total dû</label>
                    <div className="relative">
                      <Input type="number" inputMode="decimal" min="0" step="any" value={payDue}
                        onChange={(e) => setPayDue(e.target.value)} placeholder="0" className="pr-8 text-sm" aria-label="Total dû" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">DH</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500">Encaissé</label>
                    <div className="relative">
                      <Input type="number" inputMode="decimal" min="0" step="any" value={payPaid}
                        onChange={(e) => setPayPaid(e.target.value)} placeholder="0" className="pr-8 text-sm" aria-label="Encaissé" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">DH</span>
                    </div>
                  </div>
                </div>

                {/* Reste à payer + solder */}
                {(() => {
                  const due = parseFloat(payDue.replace(',', '.'))
                  const paid = parseFloat(payPaid.replace(',', '.'))
                  const reste = Math.round((due - paid) * 100) / 100
                  if (Number.isFinite(due) && Number.isFinite(paid) && reste > 0) {
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-orange-600 font-medium">Reste : {reste} DH</span>
                        <button type="button" onClick={() => setPayPaid(payDue)} className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 hover:bg-green-100">
                          Solder
                        </button>
                      </div>
                    )
                  }
                  return null
                })()}

                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                >
                  <option value="especes">Espèces</option>
                  <option value="carte">Carte</option>
                  <option value="cheque">Chèque</option>
                  <option value="virement">Virement</option>
                </select>
                <Button size="sm" className="w-full bg-green-600 hover:bg-green-700" onClick={encaisser} disabled={payingNow || !payPaid}>
                  {payingNow ? 'Enregistrement…' : 'Valider l\'encaissement'}
                </Button>
              </div>
            )}

            <p className="text-[11px] text-gray-400 px-1 pt-1">Pour un acompte, mettez « Encaissé » inférieur au « Total dû ».</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
