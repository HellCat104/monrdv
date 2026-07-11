'use client'

// Poste de consultation : 3 colonnes (dossier / note+constantes / actions).
import { useState } from 'react'
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
  patient, recentNotes, recentPrescriptions, recentVitals,
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

  const vLabel = (k: string) => vitalDefsAll.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefsAll.find((v) => v.key === k)?.unit || ''

  async function saveNote() {
    if (!note.trim()) return
    setNoteState('saving')
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
    setTimeout(() => setNoteState('idle'), 2000)
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
    const amount = defaultPrice ?? 0
    const { error } = await supabase
      .from('appointments')
      .update({ amount_paid: amount, amount_due: defaultPrice, payment_method: 'especes', paid_at: new Date().toISOString() })
      .eq('id', appointmentId)
    if (!error) { setPaid(true); setPaidAmount(amount) }
  }

  async function terminer() {
    if (note.trim() && noteState !== 'saved') await saveNote()
    router.push('/appointments')
    router.refresh()
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
        <Button onClick={terminer}>
          <CheckCircle2 className="h-4 w-4 mr-1.5" /> Terminer la consultation
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
                <a key={p.id} href={`/ordonnance/p/${p.id}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-gray-600 hover:text-primary-600 mb-1.5 border-l-2 border-gray-100 pl-2">
                  <span className="text-gray-400">{formatDateFr(p.created_at)}</span>
                  <span className="line-clamp-1 whitespace-pre-wrap">{p.content}</span>
                </a>
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

            <a href={`/ordonnance/${appointmentId}`} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
              <Pill className="h-4 w-4 text-primary-500" /> Ordonnance
            </a>

            <a href={`/patients?certificat=${patient.id}`} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
              <FileText className="h-4 w-4 text-primary-500" /> Certificat
            </a>

            {paid ? (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                <Check className="h-4 w-4" /> Encaissé{paidAmount != null ? ` · ${paidAmount} DH` : ''}
              </div>
            ) : (
              <button onClick={encaisser} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-green-300 hover:bg-green-50 transition-colors">
                <Wallet className="h-4 w-4 text-green-500" /> Encaisser{defaultPrice != null ? ` ${defaultPrice} DH` : ''}
              </button>
            )}

            {paid && (
              <a href={`/facture/${appointmentId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                <Printer className="h-4 w-4 text-primary-500" /> Facture
              </a>
            )}

            <p className="text-[11px] text-gray-400 px-1 pt-1">L&apos;encaissement rapide se fait en espèces au tarif du motif. Pour un paiement partiel ou un autre mode, utilisez « Encaisser » depuis l&apos;agenda.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
