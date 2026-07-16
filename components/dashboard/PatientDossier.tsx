'use client'

// Dossier patient pleine page — 3 colonnes : identité / historique / suivi.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppointmentList, type PaymentPayload } from '@/components/dashboard/AppointmentList'
import GrowthChart from '@/components/dashboard/GrowthChart'
import VaccinationCard from '@/components/dashboard/VaccinationCard'
import MilestonesCard from '@/components/dashboard/MilestonesCard'
import DentalChart from '@/components/dashboard/DentalChart'
import { isDentalDoctor } from '@/lib/dental'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getInitials, formatDateFr, formatDateShort, getNowInMaroc } from '@/lib/utils'
import { BLOOD_GROUPS, MUTUELLES_MAROC, isPediatricDoctor, isPsychiatricDoctor, PSY_NOTE_TEMPLATE,
  type Patient, type Appointment, type AppointmentStatus, type AppointmentAttendance, type ConsultationNote, type Prescription, type Recall, type PatientDocument, type VitalSign, type VitalDef } from '@/types'
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, ShieldCheck, Save, Check, Plus, X, BellRing,
  Pill, FileText, Paperclip, Download, Trash2, Activity, HeartPulse, Printer, RefreshCw, Calendar } from 'lucide-react'

const DOC_BUCKET = 'patient-documents'

export default function PatientDossier({
  doctorId, doctorName, doctorSlug, specialties, enabledVitals, vitalDefsAll, initialPatient,
}: {
  doctorId: string
  doctorName: string
  doctorSlug: string
  specialties: string[]
  enabledVitals: string[]
  vitalDefsAll: VitalDef[]
  initialPatient: Patient
}) {
  const supabase = createClient()
  const router = useRouter()
  const patient = initialPatient
  const isPsy = isPsychiatricDoctor(specialties)

  // Champs éditables de la fiche
  const [editAge, setEditAge] = useState(patient.age != null ? String(patient.age) : '')
  const [editBirthDate, setEditBirthDate] = useState(patient.birth_date ?? '')
  const [editSex, setEditSex] = useState<'M' | 'F' | ''>(patient.sex ?? '')
  const [editParent1, setEditParent1] = useState(patient.parent1_name ?? '')
  const [editParent2, setEditParent2] = useState(patient.parent2_name ?? '')
  const [editParent1Phone, setEditParent1Phone] = useState(patient.parent1_phone ?? '')
  const [editParent2Phone, setEditParent2Phone] = useState(patient.parent2_phone ?? '')
  const [editPrimary, setEditPrimary] = useState<'parent1' | 'parent2' | ''>(patient.primary_contact ?? '')

  // Fratrie : les enfants d'une même famille partagent family_id
  const [familyId, setFamilyId] = useState<string | null>(patient.family_id ?? null)
  const [siblings, setSiblings] = useState<{ id: string; first_name: string; last_name: string; birth_date: string | null }[]>([])
  const [sibSearch, setSibSearch] = useState('')
  const [sibResults, setSibResults] = useState<{ id: string; first_name: string; last_name: string; birth_date: string | null }[]>([])
  const [editBloodGroup, setEditBloodGroup] = useState(patient.blood_group ?? '')
  const [editCin, setEditCin] = useState(patient.cin ?? '')
  const [editEmail, setEditEmail] = useState(patient.email ?? '')
  const [editAddress, setEditAddress] = useState(patient.address ?? '')
  const [editMutuelle, setEditMutuelle] = useState(patient.mutuelle ?? '')
  const [mutuelleOther, setMutuelleOther] = useState(!!patient.mutuelle && !(MUTUELLES_MAROC as readonly string[]).includes(patient.mutuelle))
  const [editAllergies, setEditAllergies] = useState(patient.allergies ?? '')
  const [editChronic, setEditChronic] = useState(patient.chronic_conditions ?? '')
  const [editSurgeries, setEditSurgeries] = useState(patient.surgeries ?? '')
  const [editTreatments, setEditTreatments] = useState(patient.current_treatments ?? '')
  const [editVaccinations, setEditVaccinations] = useState(patient.vaccinations ?? '')
  const [editNotes, setEditNotes] = useState(patient.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Données liées
  const [appts, setAppts] = useState<Appointment[]>([])
  const [consultNotes, setConsultNotes] = useState<ConsultationNote[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [documents, setDocuments] = useState<PatientDocument[]>([])
  const [vitals, setVitals] = useState<VitalSign[]>([])
  const [loading, setLoading] = useState(true)

  // Ajouts
  const [newNote, setNewNote] = useState(isPsy ? PSY_NOTE_TEMPLATE : '')
  const [addingNote, setAddingNote] = useState(false)
  const [recallDate, setRecallDate] = useState('')
  const [recallReason, setRecallReason] = useState('')
  const [addingRecall, setAddingRecall] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [vitalInput, setVitalInput] = useState<Record<string, string>>({})
  const [savingVital, setSavingVital] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [aptRes, notesRes, presRes, recallsRes, docsRes, vitalsRes] = await Promise.all([
      supabase.from('appointments').select('*, patient:patients(*)').eq('patient_id', patient.id).order('date', { ascending: false }).order('time', { ascending: false }),
      supabase.from('consultation_notes').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
      supabase.from('prescriptions').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
      supabase.from('recalls').select('*').eq('patient_id', patient.id).order('due_date', { ascending: true }),
      supabase.from('patient_documents').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
      supabase.from('vital_signs').select('*').eq('patient_id', patient.id).order('measured_at', { ascending: false }),
    ])
    setAppts(aptRes.data ?? [])
    setConsultNotes(notesRes.data ?? [])
    setPrescriptions(presRes.data ?? [])
    setRecalls(recallsRes.data ?? [])
    setDocuments(docsRes.data ?? [])
    setVitals(vitalsRes.data ?? [])
    setLoading(false)
  }, [patient.id, supabase])
  useEffect(() => { load() }, [load])

  // Frères et sœurs (même family_id)
  useEffect(() => {
    if (!familyId) { setSiblings([]); return }
    supabase.from('patients')
      .select('id, first_name, last_name, birth_date')
      .eq('doctor_id', doctorId).eq('family_id', familyId).neq('id', patient.id)
      .then(({ data }) => setSiblings(data ?? []))
  }, [familyId, doctorId, patient.id, supabase])

  // Recherche d'un enfant à lier (dans la patientèle du médecin)
  useEffect(() => {
    const q = sibSearch.trim()
    if (q.length < 2) { setSibResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('patients')
        .select('id, first_name, last_name, birth_date')
        .eq('doctor_id', doctorId).neq('id', patient.id)
        .or(`first_name.ilike.%${q.replace(/[%,()]/g, '')}%,last_name.ilike.%${q.replace(/[%,()]/g, '')}%`)
        .limit(6)
      setSibResults((data ?? []).filter((p) => !siblings.some((s) => s.id === p.id)))
    }, 300)
    return () => clearTimeout(t)
  }, [sibSearch, doctorId, patient.id, siblings, supabase])

  async function linkSibling(p: { id: string }) {
    const fid = familyId ?? crypto.randomUUID()
    const { error } = await supabase.from('patients').update({ family_id: fid }).in('id', [patient.id, p.id])
    if (error) { alert('Impossible de lier — lancez la migration v34 si ce n\'est pas fait.'); return }
    setFamilyId(fid); setSibSearch(''); setSibResults([])
  }

  async function unlinkSibling(id: string) {
    const { error } = await supabase.from('patients').update({ family_id: null }).eq('id', id)
    if (!error) setSiblings((prev) => prev.filter((s) => s.id !== id))
  }

  async function saveIdentity() {
    setSaving(true)
    const updates = {
      age: editAge ? Number(editAge) : null,
      birth_date: editBirthDate || null,
      sex: editSex || null,
      parent1_name: editParent1.trim() || null,
      parent2_name: editParent2.trim() || null,
      parent1_phone: editParent1Phone.trim() || null,
      parent2_phone: editParent2Phone.trim() || null,
      primary_contact: editPrimary || null,
      blood_group: editBloodGroup || null,
      cin: editCin.trim() ? editCin.trim().toUpperCase() : null,
      email: editEmail.trim() || null,
      address: editAddress.trim() || null,
      mutuelle: editMutuelle.trim() || null,
      notes: editNotes || null,
      allergies: editAllergies || null,
      chronic_conditions: editChronic || null,
      surgeries: editSurgeries || null,
      current_treatments: editTreatments || null,
      vaccinations: editVaccinations || null,
    }
    const { error } = await supabase.from('patients').update(updates).eq('id', patient.id)
    setSaving(false)
    if (error) { alert('L\'enregistrement a échoué. Réessayez.'); return }
    setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  async function addConsultNote() {
    if (!newNote.trim() || newNote === PSY_NOTE_TEMPLATE) return
    setAddingNote(true)
    const { data, error } = await supabase.from('consultation_notes')
      .insert({ doctor_id: doctorId, patient_id: patient.id, note: newNote.trim() }).select().single()
    setAddingNote(false)
    if (!error && data) { setConsultNotes((prev) => [data, ...prev]); setNewNote(isPsy ? PSY_NOTE_TEMPLATE : '') }
  }

  async function addRecall() {
    if (!recallDate) return
    setAddingRecall(true)
    const { data, error } = await supabase.from('recalls')
      .insert({ doctor_id: doctorId, patient_id: patient.id, due_date: recallDate, reason: recallReason.trim() || null }).select().single()
    setAddingRecall(false)
    if (!error && data) { setRecalls((prev) => [...prev, data].sort((a, b) => a.due_date.localeCompare(b.due_date))); setRecallDate(''); setRecallReason('') }
  }
  async function cancelRecall(id: string) {
    const { error } = await supabase.from('recalls').delete().eq('id', id)
    if (!error) setRecalls((prev) => prev.filter((r) => r.id !== id))
  }

  async function handlePayment(id: string, payload: PaymentPayload) {
    const res = await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Échec du paiement') }
    const updated = await res.json().catch(() => null)
    setAppts((prev) => prev.map((a) => a.id === id ? { ...a, amount_paid: payload.amount_paid, amount_due: payload.amount_due, payment_method: payload.payment_method, paid_at: updated?.paid_at ?? (payload.amount_paid !== null ? new Date().toISOString() : null) } : a))
  }
  async function handleReschedule(id: string, date: string, time: string) {
    const res = await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Échec du déplacement') }
    await load()
  }
  async function handleStatusChange(id: string, status: AppointmentStatus) {
    await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    await load()
  }
  async function handleAttendance(id: string, attendance: AppointmentAttendance) {
    await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendance }) })
    setAppts((prev) => prev.map((a) => a.id === id ? { ...a, attendance } : a))
  }

  async function renewPrescription(p: Prescription) {
    const { data, error } = await supabase.from('prescriptions')
      .insert({ doctor_id: doctorId, patient_id: patient.id, appointment_id: null, content: p.content }).select('*').single()
    if (error || !data) { alert('Échec du renouvellement'); return }
    setPrescriptions((prev) => [data, ...prev])
    window.open(`/ordonnance/p/${data.id}`, '_blank')
  }

  async function uploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('Le fichier ne doit pas dépasser 10 Mo.'); e.target.value = ''; return }
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    if (['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs', '.exe', '.sh', '.bat'].includes(ext)) {
      alert('Ce type de fichier n\'est pas autorisé (PDF, image ou document Word/Excel).'); e.target.value = ''; return
    }
    setUploadingDoc(true)
    try {
      const safeName = file.name.replace(/[^\w.\-]/g, '_').substring(0, 120)
      const path = `${doctorId}/${patient.id}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (upErr) throw upErr
      const { data, error: insErr } = await supabase.from('patient_documents')
        .insert({ doctor_id: doctorId, patient_id: patient.id, file_path: path, file_name: file.name.substring(0, 200), file_type: file.type || null }).select().single()
      if (insErr) throw insErr
      setDocuments((prev) => [data, ...prev])
    } catch { alert('Échec de l\'envoi du document.') } finally { setUploadingDoc(false); e.target.value = '' }
  }
  async function downloadDocument(doc: PatientDocument) {
    const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(doc.file_path, 120)
    if (error || !data) { alert('Impossible d\'ouvrir le document.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function addVital() {
    const values: Record<string, number> = {}
    for (const key of enabledVitals) {
      const raw = vitalInput[key]
      if (raw != null && raw !== '') { const n = parseFloat(String(raw).replace(',', '.')); if (!isNaN(n)) values[key] = n }
    }
    if (Object.keys(values).length === 0) return
    setSavingVital(true)
    const { data, error } = await supabase.from('vital_signs').insert({ doctor_id: doctorId, patient_id: patient.id, values }).select().single()
    setSavingVital(false)
    if (!error && data) { setVitals((prev) => [data, ...prev]); setVitalInput({}) }
  }

  async function deletePatient() {
    if (!confirm('Supprimer définitivement ce patient et tout son dossier ? Action irréversible.')) return
    const { error } = await supabase.from('patients').delete().eq('id', patient.id)
    if (error) { alert('La suppression a échoué.'); return }
    router.push('/patients')
  }

  // ── Dérivés (colonne droite) ──
  const now = getNowInMaroc()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const nextApt = appts.filter((a) => a.date >= todayStr && a.status !== 'cancelled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0]
  const totalPaid = appts.reduce((s, a) => s + (a.amount_paid ?? 0), 0)
  const totalDue = appts.reduce((s, a) => s + (a.amount_due != null && (a.amount_paid ?? 0) < a.amount_due ? a.amount_due - (a.amount_paid ?? 0) : 0), 0)
  const billed = appts.filter((a) => a.amount_paid != null || a.amount_due != null)
  const vLabel = (k: string) => vitalDefsAll.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefsAll.find((v) => v.key === k)?.unit || ''

  const sec = 'bg-white border border-gray-100 rounded-xl p-4'
  const secTitle = 'text-sm font-semibold text-primary-600 mb-3 flex items-center justify-between'

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/patients')} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-bold text-gray-900">Détail du patient</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] gap-4 items-start">
        {/* ── COLONNE GAUCHE : identité ── */}
        <div className="space-y-4">
          {/* Enregistrer — toujours visible (sticky) */}
          <div className="sticky top-2 z-20">
            <Button onClick={saveIdentity} disabled={saving} className="w-full shadow-md">
              {saved ? <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Enregistré !</span> : <span className="flex items-center gap-1.5"><Save className="h-4 w-4" /> {saving ? 'Sauvegarde…' : 'Enregistrer la fiche'}</span>}
            </Button>
          </div>
          <div className={sec}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold">{getInitials(patient.first_name, patient.last_name)}</div>
              <div>
                <p className="font-bold text-gray-900">{patient.first_name} {patient.last_name}</p>
                {editMutuelle && <span className="inline-block bg-green-100 text-green-700 text-[11px] font-medium px-2 py-0.5 rounded-full mt-0.5">{editMutuelle}</span>}
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600"><Phone className="h-3.5 w-3.5 text-primary-500 shrink-0" /> {patient.phone}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Âge</Label><Input type="number" value={editAge} onChange={(e) => setEditAge(e.target.value)} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Naissance</Label><Input type="date" value={editBirthDate} max={todayStr} onChange={(e) => setEditBirthDate(e.target.value)} className="h-9" /></div>
              </div>
              {isPediatricDoctor(specialties) && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-gray-400">Sexe (couloirs OMS des courbes)</Label>
                    <div className="flex gap-1.5">
                      {([['M', 'Garçon'], ['F', 'Fille']] as const).map(([v, lbl]) => (
                        <button key={v} type="button" onClick={() => setEditSex(editSex === v ? '' : v)}
                          className={`flex-1 text-xs px-2 py-1.5 rounded-lg border transition ${editSex === v ? 'bg-primary-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  {([
                    ['parent1', 'Parent / tuteur 1', editParent1, setEditParent1, editParent1Phone, setEditParent1Phone, 'Ex : Fatima Alami (mère)'],
                    ['parent2', 'Parent / tuteur 2', editParent2, setEditParent2, editParent2Phone, setEditParent2Phone, 'Ex : Karim Alami (père)'],
                  ] as const).map(([key, lbl, name, setName, phone, setPhone, ph]) => (
                    <div key={key} className="space-y-1 rounded-lg border border-gray-100 p-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-gray-400">{lbl} (optionnel)</Label>
                        <button type="button"
                          onClick={() => setEditPrimary(editPrimary === key ? '' : key)}
                          title="Contact à prévenir en priorité (rappels, urgences)"
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border transition ${editPrimary === key ? 'bg-amber-400 text-white border-transparent' : 'text-gray-400 border-gray-200 hover:border-amber-300'}`}>
                          {editPrimary === key ? '★ Prioritaire' : '☆ Prioritaire'}
                        </button>
                      </div>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={ph} className="h-9" />
                      <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" className="h-9" />
                    </div>
                  ))}
                </>
              )}
              <div className="space-y-1"><Label className="text-[11px] text-gray-400 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label><Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="patient@email.com" className="h-9" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> Adresse</Label><Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Quartier, ville" className="h-9" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400 flex items-center gap-1"><CreditCard className="h-3 w-3" /> CIN</Label><Input value={editCin} onChange={(e) => setEditCin(e.target.value.toUpperCase())} placeholder="AB123456" className="h-9" /></div>
              <div className="space-y-1">
                <Label className="text-[11px] text-gray-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Mutuelle</Label>
                <Select value={mutuelleOther ? 'Autre' : (editMutuelle || undefined)} onValueChange={(v) => { if (v === 'Autre') { setMutuelleOther(true); setEditMutuelle('') } else { setMutuelleOther(false); setEditMutuelle(v) } }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>{MUTUELLES_MAROC.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}<SelectItem value="Autre">Autre…</SelectItem></SelectContent>
                </Select>
                {mutuelleOther && <Input value={editMutuelle} onChange={(e) => setEditMutuelle(e.target.value)} placeholder="Précisez" className="h-9 mt-1.5" />}
              </div>
              {!isPsy && (
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Groupe sanguin</Label>
                  <Select value={editBloodGroup || undefined} onValueChange={setEditBloodGroup}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Antécédents */}
          <div className={sec}>
            <div className={secTitle}><span className="flex items-center gap-1.5"><HeartPulse className="h-4 w-4" /> Antécédents</span></div>
            <div className="space-y-2.5">
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Allergies</Label><textarea value={editAllergies} onChange={(e) => setEditAllergies(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Maladies chroniques</Label><textarea value={editChronic} onChange={(e) => setEditChronic(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Antécédents chirurgicaux</Label><textarea value={editSurgeries} onChange={(e) => setEditSurgeries(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Traitements de fond</Label><textarea value={editTreatments} onChange={(e) => setEditTreatments(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              {!isPsy && (
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Vaccins</Label><textarea value={editVaccinations} onChange={(e) => setEditVaccinations(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              )}
            </div>
          </div>

          {/* Famille / fratrie (pédiatrie) */}
          {isPediatricDoctor(specialties) && (
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5">👨‍👩‍👧 Famille</span></div>
              {siblings.length > 0 && (
                <ul className="space-y-1.5 mb-2">
                  {siblings.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <button onClick={() => router.push(`/patients/${s.id}`)} className="text-sm text-primary-600 hover:underline text-left truncate">
                        {s.first_name} {s.last_name}
                        {s.birth_date && <span className="text-gray-400"> · {new Date(s.birth_date).getFullYear()}</span>}
                      </button>
                      <button onClick={() => unlinkSibling(s.id)} title="Retirer de la famille" className="text-gray-300 hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="relative">
                <Input value={sibSearch} onChange={(e) => setSibSearch(e.target.value)} placeholder="Lier un frère / une sœur…" className="h-9" />
                {sibResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
                    {sibResults.map((p) => (
                      <button key={p.id} onClick={() => linkSibling(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50">
                        {p.first_name} {p.last_name}{p.birth_date && <span className="text-gray-400"> · {new Date(p.birth_date).getFullYear()}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Reliez les enfants d&apos;une même famille : leurs dossiers deviennent accessibles en un clic.</p>
            </div>
          )}

          {/* Documents */}
          <div className={sec}>
            <div className={secTitle}><span className="flex items-center gap-1.5"><Paperclip className="h-4 w-4" /> Documents ({documents.length})</span>
              <label className="text-xs font-medium text-primary-600 cursor-pointer hover:text-primary-700">{uploadingDoc ? '…' : '＋ Ajouter'}<input type="file" className="hidden" onChange={uploadDocument} disabled={uploadingDoc} /></label>
            </div>
            {documents.length === 0 ? <p className="text-xs text-gray-400 italic">Analyses, radios, ordonnances scannées… (max 10 Mo)</p> : (
              <ul className="space-y-1.5">
                {documents.map((d) => (
                  <li key={d.id}><button onClick={() => downloadDocument(d)} className="text-sm text-primary-600 hover:underline truncate flex items-center gap-1.5 w-full text-left"><Download className="h-3.5 w-3.5 shrink-0" /> {d.file_name}</button></li>
                ))}
              </ul>
            )}
          </div>

          <button onClick={deletePatient} className="w-full text-xs text-gray-400 hover:text-red-500 flex items-center justify-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Supprimer ce patient</button>
        </div>

        {/* ── COLONNE CENTRE : historique ── */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`/ordonnance/patient/${patient.id}?back=${encodeURIComponent(`/patients/${patient.id}`)}`} className="flex items-center gap-1.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-3 py-2"><Pill className="h-4 w-4" /> Nouvelle ordonnance</a>
            <a href={`/certificat/nouveau/${patient.id}?back=${encodeURIComponent(`/patients/${patient.id}`)}`} className="flex items-center gap-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg px-3 py-2 hover:bg-primary-50"><FileText className="h-4 w-4" /> Nouveau certificat</a>
            <a href={`/dossier/${patient.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"><Printer className="h-4 w-4" /> Imprimer</a>
          </div>

          <div className={sec}>
            <div className={secTitle}><span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Historique des rendez-vous ({appts.length})</span></div>
            {loading ? <p className="text-sm text-gray-400">Chargement…</p> : appts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Aucun rendez-vous pour ce patient.</p>
            ) : (
              <AppointmentList
                appointments={appts}
                onPayment={handlePayment}
                onReschedule={handleReschedule}
                onStatusChange={handleStatusChange}
                onAttendanceChange={handleAttendance}
              />
            )}
          </div>

          {/* Ordonnances */}
          {prescriptions.length > 0 && (
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Pill className="h-4 w-4" /> Ordonnances ({prescriptions.length})</span></div>
              <ul className="space-y-1.5">
                {prescriptions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <button onClick={() => window.open(`/ordonnance/p/${p.id}`, '_blank')} className="text-gray-700 hover:text-primary-600 truncate text-left flex-1">
                      <span className="text-gray-400">{formatDateShort(p.created_at)} · </span>{(p.content ?? '').split('\n').filter(Boolean)[0] || 'Ordonnance'}
                    </button>
                    <button onClick={() => renewPrescription(p)} title="Renouveler" className="text-primary-500 hover:text-primary-700 shrink-0"><RefreshCw className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sections spécialité */}
          {isDentalDoctor(specialties) && <DentalChart key={patient.id} patientId={patient.id} doctorId={doctorId} />}
          {isPediatricDoctor(specialties) && editBirthDate && (
            <div className="space-y-4">
              <GrowthChart key={`g-${patient.id}`} birthDate={editBirthDate} vitals={vitals} sex={editSex || null} />
              <VaccinationCard key={`v-${patient.id}`} patientId={patient.id} birthDate={editBirthDate} initial={patient.vaccines ?? {}} />
              <MilestonesCard key={`ms-${patient.id}`} patientId={patient.id} birthDate={editBirthDate} initial={patient.milestones ?? {}} />
            </div>
          )}
          {isPediatricDoctor(specialties) && !editBirthDate && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              📅 Renseignez la <b>date de naissance</b> (colonne de gauche) pour activer la courbe de croissance, le calendrier vaccinal et les repères de développement.
            </p>
          )}

          {/* Constantes (hors psy) */}
          {!isPsy && enabledVitals.length > 0 && (
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Activity className="h-4 w-4" /> Constantes ({vitals.length})</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                {enabledVitals.map((k) => (
                  <div key={k} className="relative">
                    <Input type="number" inputMode="decimal" value={vitalInput[k] ?? ''} onChange={(e) => setVitalInput((prev) => ({ ...prev, [k]: e.target.value }))} placeholder={vLabel(k)} className="pr-10 text-sm" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{vUnit(k)}</span>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addVital} disabled={savingVital}><Plus className="h-4 w-4 mr-1" /> {savingVital ? '…' : 'Enregistrer la mesure'}</Button>
              {vitals.length > 0 && (
                <div className="space-y-2 mt-3">
                  {vitals.map((m) => (
                    <div key={m.id} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[11px] text-gray-400 mb-1 capitalize">{formatDateFr(m.measured_at)}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-700">
                        {Object.keys(m.values).map((k) => <span key={k}><b className="font-medium">{vLabel(k)}</b> {m.values[k]} {vUnit(k)}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── COLONNE DROITE : prochaine visite / encaissements / notes ── */}
        <div className="space-y-4">
          {/* Prochaine visite */}
          <div className={sec}>
            <div className={secTitle}><span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Prochaine visite</span></div>
            {nextApt ? (
              <div className="text-sm text-gray-700">
                <p className="font-medium capitalize">{nextApt.date === todayStr ? "Aujourd'hui" : formatDateFr(nextApt.date)}</p>
                <p className="text-gray-500">{String(nextApt.time).substring(0, 5)}{(nextApt as { consultation_type?: { name?: string } }).consultation_type?.name ? ` · ${(nextApt as { consultation_type?: { name?: string } }).consultation_type!.name}` : ''}</p>
              </div>
            ) : <p className="text-sm text-gray-400 italic">Aucun RDV planifié.</p>}

            {/* Programmer un rappel */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 mb-1.5 flex items-center gap-1"><BellRing className="h-3 w-3" /> Rappel de suivi</p>
              {recalls.filter((r) => r.status !== 'cancelled').map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 mb-1.5">
                  <span className="text-xs text-gray-700">{formatDateShort(r.due_date)}{r.reason ? ` — ${r.reason}` : ''}</span>
                  {r.status === 'pending' && <button onClick={() => cancelRecall(r.id)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input type="date" value={recallDate} min={todayStr} onChange={(e) => setRecallDate(e.target.value)} className="h-9 text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={addRecall} disabled={!recallDate || addingRecall} className="shrink-0"><Plus className="h-4 w-4" /></Button>
              </div>
              <Input value={recallReason} onChange={(e) => setRecallReason(e.target.value)} placeholder="Motif (optionnel)" className="h-9 text-xs mt-1.5" />
            </div>
          </div>

          {/* Encaissements */}
          <div className={sec}>
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              <span className="text-primary-600">{totalPaid} DH encaissés</span>
              {totalDue > 0 && <><span className="text-gray-300">·</span><span className="text-red-500">reste {totalDue} DH</span></>}
            </div>
            {billed.length === 0 ? <p className="text-xs text-gray-400 italic">Aucun encaissement.</p> : (
              <div className="divide-y divide-gray-50">
                {billed.map((a) => {
                  const due = a.amount_due != null && (a.amount_paid ?? 0) < a.amount_due ? a.amount_due - (a.amount_paid ?? 0) : 0
                  return (
                    <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-gray-500">{formatDateShort(a.date)}</span>
                      {due > 0 ? <span className="text-red-500 font-semibold">reste {due} DH</span> : <span className="text-green-600 font-semibold">{a.amount_paid ?? 0} DH</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className={sec}>
            <div className={secTitle}><span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> Notes ({consultNotes.length})</span></div>
            <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={isPsy ? 6 : 3}
              placeholder={isPsy ? 'Motif / Histoire / Évolution / Traitement / Prochain RDV…' : 'Ajouter une note datée…'}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 mb-2" />
            <Button size="sm" onClick={addConsultNote} disabled={addingNote || !newNote.trim() || newNote === PSY_NOTE_TEMPLATE} className="w-full"><Plus className="h-4 w-4 mr-1" /> Ajouter la note</Button>
            <div className="space-y-2 mt-3">
              {consultNotes.slice(0, 8).map((n) => (
                <div key={n.id} className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[11px] text-gray-400 mb-0.5">{formatDateShort(n.created_at)}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{n.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
