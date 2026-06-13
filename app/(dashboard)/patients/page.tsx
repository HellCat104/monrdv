'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AppointmentList, type PaymentPayload } from '@/components/dashboard/AppointmentList'
import type { Patient, Appointment, ConsultationNote, PatientDocument, Recall, VitalSign } from '@/types'
import { VITAL_DEFS, resolveEnabledVitals } from '@/types'
import { getInitials, formatDateShort, formatDateFr } from '@/lib/utils'
import { Users, Search, Phone, Calendar, Save, Check, UserPlus, UserCheck, UserX, Clock, Trash2, AlertTriangle, HeartPulse, Pill, NotebookPen, Plus, Paperclip, Download, Upload, Activity, BellRing, X } from 'lucide-react'

const DOC_BUCKET = 'patient-documents'

interface PatientWithStats extends Patient {
  appointment_count: number
  last_appointment_date: string | null
  present_count: number
  absent_count: number
  late_count: number
  age?: number | null
  notes?: string | null
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientWithStats[]>([])
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [doctorSlug, setDoctorSlug] = useState<string>('')
  const [enabledVitals, setEnabledVitals] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientWithStats | null>(null)
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editAge, setEditAge] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [editAllergies, setEditAllergies] = useState<string>('')
  const [editChronic, setEditChronic] = useState<string>('')
  const [editTreatments, setEditTreatments] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Notes de consultation datées (timeline)
  const [consultNotes, setConsultNotes] = useState<ConsultationNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<ConsultationNote | null>(null)

  // Documents du patient (analyses, radios scannées…)
  const [documents, setDocuments] = useState<PatientDocument[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [deleteDocConfirm, setDeleteDocConfirm] = useState<PatientDocument | null>(null)

  // Rappels de suivi
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [recallDate, setRecallDate] = useState('')
  const [recallReason, setRecallReason] = useState('')
  const [addingRecall, setAddingRecall] = useState(false)

  // Constantes vitales
  const [vitals, setVitals] = useState<VitalSign[]>([])
  const [vitalInput, setVitalInput] = useState<Record<string, string>>({})
  const [savingVital, setSavingVital] = useState(false)

  // Ajout d'un patient
  const [addOpen, setAddOpen] = useState(false)
  const [newPatient, setNewPatient] = useState({ first_name: '', last_name: '', phone: '', notes: '' })
  const [addingPatient, setAddingPatient] = useState(false)
  const [addError, setAddError] = useState('')

  // Suppression d'un patient
  const [deleteConfirm, setDeleteConfirm] = useState<PatientWithStats | null>(null)
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, slug, specialty, enabled_vitals')
      .eq('email', user.email)
      .single()

    if (!doctor) return
    setDoctorId(doctor.id)
    setDoctorSlug(doctor.slug ?? '')
    setEnabledVitals(resolveEnabledVitals(doctor.enabled_vitals, doctor.specialty))

    // Récupère les patients avec leurs RDV (date + présence)
    const { data: pts } = await supabase
      .from('patients')
      .select('*, appointments(date, attendance, status)')
      .eq('doctor_id', doctor.id)
      .order('created_at', { ascending: false })

    const enriched: PatientWithStats[] = (pts ?? []).map((p: any) => {
      const apts = p.appointments ?? []
      const sorted = [...apts].sort((a: any, b: any) => b.date.localeCompare(a.date))
      return {
        ...p,
        appointment_count: apts.length,
        last_appointment_date: sorted[0]?.date ?? null,
        present_count: apts.filter((a: any) => a.attendance === 'present').length,
        absent_count: apts.filter((a: any) => a.attendance === 'absent').length,
        late_count: apts.filter((a: any) => a.attendance === 'late').length,
      }
    })

    setPatients(enriched)
    setLoading(false)

    // Ouvre automatiquement une fiche si ?patient=<id> est dans l'URL
    const params = new URLSearchParams(window.location.search)
    const patientId = params.get('patient')
    if (patientId) {
      const target = enriched.find((p) => p.id === patientId)
      if (target) openPatientHistory(target)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openPatientHistory(patient: PatientWithStats) {
    setSelectedPatient(patient)
    setEditAge(patient.age != null ? String(patient.age) : '')
    setEditNotes(patient.notes ?? '')
    setEditAllergies(patient.allergies ?? '')
    setEditChronic(patient.chronic_conditions ?? '')
    setEditTreatments(patient.current_treatments ?? '')
    setNewNote('')
    setConsultNotes([])
    setDocuments([])
    setRecalls([])
    setVitals([])
    setVitalInput({})
    setRecallDate('')
    setRecallReason('')
    setLoadingHistory(true)
    setSaved(false)

    const [aptRes, notesRes, docsRes, recallsRes, vitalsRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, patient:patients(*)')
        .eq('patient_id', patient.id)
        .order('date', { ascending: false })
        .order('time', { ascending: false }),
      supabase
        .from('consultation_notes')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('patient_documents')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('recalls')
        .select('*')
        .eq('patient_id', patient.id)
        .order('due_date', { ascending: true }),
      supabase
        .from('vital_signs')
        .select('*')
        .eq('patient_id', patient.id)
        .order('measured_at', { ascending: false }),
    ])

    setPatientAppointments(aptRes.data ?? [])
    setConsultNotes(notesRes.data ?? [])
    setDocuments(docsRes.data ?? [])
    setRecalls(recallsRes.data ?? [])
    setVitals(vitalsRes.data ?? [])
    setLoadingHistory(false)
  }

  // ── Rappels de suivi ────────────────────────────────────────────────────
  async function addRecall() {
    if (!selectedPatient || !doctorId || !recallDate) return
    setAddingRecall(true)
    const { data, error } = await supabase
      .from('recalls')
      .insert({
        doctor_id: doctorId,
        patient_id: selectedPatient.id,
        due_date: recallDate,
        reason: recallReason.trim() || null,
      })
      .select()
      .single()
    setAddingRecall(false)
    if (!error && data) {
      setRecalls((prev) => [...prev, data].sort((a, b) => a.due_date.localeCompare(b.due_date)))
      setRecallDate('')
      setRecallReason('')
    }
  }

  async function cancelRecall(id: string) {
    const { error } = await supabase.from('recalls').delete().eq('id', id)
    if (error) { alert('La suppression du rappel a échoué.'); return }
    setRecalls((prev) => prev.filter((r) => r.id !== id))
  }

  // ── Constantes vitales ──────────────────────────────────────────────────
  async function addVital() {
    if (!selectedPatient || !doctorId) return
    // Ne garde que les champs activés et réellement remplis
    const values: Record<string, number> = {}
    for (const key of enabledVitals) {
      const raw = vitalInput[key]
      if (raw != null && raw !== '') {
        const n = parseFloat(String(raw).replace(',', '.'))
        if (!isNaN(n)) values[key] = n
      }
    }
    if (Object.keys(values).length === 0) return
    setSavingVital(true)
    const { data, error } = await supabase
      .from('vital_signs')
      .insert({ doctor_id: doctorId, patient_id: selectedPatient.id, values })
      .select()
      .single()
    setSavingVital(false)
    if (!error && data) {
      setVitals((prev) => [data, ...prev])
      setVitalInput({})
    }
  }

  // Encaissement modifiable directement depuis la fiche patient (historique RDV)
  async function handlePatientPayment(id: string, payload: PaymentPayload) {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Échec de l\'enregistrement du paiement')
    }
    const updated = await res.json().catch(() => null)
    setPatientAppointments((prev) =>
      prev.map((a) => a.id === id
        ? {
            ...a,
            amount_paid: payload.amount_paid,
            amount_due: payload.amount_due,
            payment_method: payload.payment_method,
            paid_at: updated?.paid_at ?? (payload.amount_paid !== null ? new Date().toISOString() : null),
          }
        : a)
    )
  }

  async function addConsultNote() {
    if (!selectedPatient || !doctorId || !newNote.trim()) return
    setAddingNote(true)
    const { data, error } = await supabase
      .from('consultation_notes')
      .insert({
        doctor_id: doctorId,
        patient_id: selectedPatient.id,
        note: newNote.trim(),
      })
      .select()
      .single()
    setAddingNote(false)
    if (!error && data) {
      setConsultNotes((prev) => [data, ...prev])
      setNewNote('')
    }
  }

  async function deleteConsultNote(id: string) {
    const { error } = await supabase.from('consultation_notes').delete().eq('id', id)
    if (error) { alert('La suppression de la note a échoué. Réessayez.'); return }
    setConsultNotes((prev) => prev.filter((n) => n.id !== id))
    setDeleteNoteConfirm(null)
  }

  // ── Documents du patient ──────────────────────────────────────────────────
  async function handleUploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedPatient || !doctorId) return
    if (file.size > 10 * 1024 * 1024) { alert('Le fichier ne doit pas dépasser 10 Mo.'); e.target.value = ''; return }
    // Bloque les formats potentiellement exécutables (script en SVG/HTML, etc.)
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    const BLOCKED = ['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs', '.exe', '.sh', '.bat']
    if (BLOCKED.includes(ext)) {
      alert('Ce type de fichier n\'est pas autorisé. Utilisez un PDF, une image (JPG/PNG) ou un document Word/Excel.')
      e.target.value = ''
      return
    }
    if (documents.length >= 50) { alert('Limite de 50 documents par patient atteinte.'); e.target.value = ''; return }

    setUploadingDoc(true)
    try {
      // Chemin : {doctor_id}/{patient_id}/{horodatage}-{nom} (RLS sur le 1er dossier)
      const safeName = file.name.replace(/[^\w.\-]/g, '_').substring(0, 120)
      const path = `${doctorId}/${selectedPatient.id}/${Date.now()}-${safeName}`

      const { error: upErr } = await supabase.storage
        .from(DOC_BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (upErr) throw upErr

      const { data, error: insErr } = await supabase
        .from('patient_documents')
        .insert({
          doctor_id: doctorId,
          patient_id: selectedPatient.id,
          file_path: path,
          file_name: file.name.substring(0, 200),
          file_type: file.type || null,
        })
        .select()
        .single()
      if (insErr) throw insErr

      setDocuments((prev) => [data, ...prev])
    } catch {
      alert('Échec de l\'envoi du document. Réessayez.')
    } finally {
      setUploadingDoc(false)
      e.target.value = ''
    }
  }

  async function handleDownloadDocument(doc: PatientDocument) {
    // Bucket privé → URL signée valable 1 min
    const { data, error } = await supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(doc.file_path, 120)
    if (error || !data) { alert('Impossible d\'ouvrir le document.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleDeleteDocument(doc: PatientDocument) {
    // On supprime d'abord le fichier (donnée de santé) : si ça échoue, on
    // n'efface pas la ligne en base, pour ne pas laisser de fichier orphelin.
    const { error: storageErr } = await supabase.storage.from(DOC_BUCKET).remove([doc.file_path])
    if (storageErr) { alert('Impossible de supprimer le fichier. Réessayez.'); return }
    const { error } = await supabase.from('patient_documents').delete().eq('id', doc.id)
    if (error) { alert('La suppression a échoué. Réessayez.'); return }
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    setDeleteDocConfirm(null)
  }

  async function savePatientNotes() {
    if (!selectedPatient) return
    setSaving(true)
    const updates = {
      age: editAge ? Number(editAge) : null,
      notes: editNotes || null,
      allergies: editAllergies || null,
      chronic_conditions: editChronic || null,
      current_treatments: editTreatments || null,
    }
    const { error } = await supabase
      .from('patients')
      .update(updates)
      .eq('id', selectedPatient.id)
    setSaving(false)
    if (error) { alert('L\'enregistrement de la fiche a échoué. Réessayez.'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setPatients((prev) => prev.map((p) =>
      p.id === selectedPatient.id ? { ...p, ...updates } : p
    ))
  }

  async function handleAddPatient(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (!doctorId) return
    if (!newPatient.first_name.trim() || !newPatient.last_name.trim() || !newPatient.phone.trim()) {
      setAddError('Prénom, nom et téléphone sont obligatoires.')
      return
    }
    setAddingPatient(true)

    const { error } = await supabase.from('patients').insert({
      doctor_id: doctorId,
      first_name: newPatient.first_name.trim(),
      last_name: newPatient.last_name.trim(),
      phone: newPatient.phone.trim(),
      notes: newPatient.notes.trim() || null,
    })

    setAddingPatient(false)

    if (error) {
      if (error.code === '23505') {
        setAddError('Un patient avec ce numéro existe déjà.')
      } else {
        setAddError('Erreur lors de l\'ajout. Réessayez.')
      }
      return
    }

    setAddOpen(false)
    setNewPatient({ first_name: '', last_name: '', phone: '', notes: '' })
    setLoading(true)
    await load()
  }

  async function handleDeletePatient() {
    if (!deleteConfirm) return
    setDeleting(true)
    const { error } = await supabase.from('patients').delete().eq('id', deleteConfirm.id)
    setDeleting(false)
    if (error) { alert('La suppression du patient a échoué. Réessayez.'); return }
    setPatients((prev) => prev.filter((p) => p.id !== deleteConfirm.id))
    setDeleteConfirm(null)
    setSelectedPatient(null)
  }

  const filtered = patients.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.phone.includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="text-sm text-gray-500 mt-1">{patients.length} patient(s) enregistré(s)</p>
        </div>
        <Button onClick={() => { setAddError(''); setAddOpen(true) }} className="shrink-0">
          <UserPlus className="h-4 w-4 mr-1.5" /> Ajouter un patient
        </Button>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou téléphone…"
          className="pl-9"
        />
      </div>

      {/* Liste des patients */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search ? 'Aucun patient trouvé' : 'Aucun patient enregistré'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:border-primary-200 hover:shadow-sm transition-all"
              onClick={() => openPatientHistory(patient)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold shrink-0">
                    {getInitials(patient.first_name, patient.last_name)}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">
                      {patient.first_name} {patient.last_name}
                    </p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {patient.phone}
                      </span>
                      {patient.last_appointment_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Dernier RDV : {formatDateShort(patient.last_appointment_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badges stats */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="secondary">{patient.appointment_count} RDV</Badge>
                    {(patient.present_count > 0 || patient.absent_count > 0) && (
                      <div className="flex items-center gap-2 text-xs">
                        {patient.present_count > 0 && (
                          <span className="text-green-600 font-medium">{patient.present_count} prés.</span>
                        )}
                        {patient.absent_count > 0 && (
                          <span className="text-red-600 font-medium">{patient.absent_count} abs.</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modale ajout patient */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary-500" /> Ajouter un patient
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPatient} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">Prénom *</label>
                <Input
                  value={newPatient.first_name}
                  onChange={(e) => setNewPatient({ ...newPatient, first_name: e.target.value })}
                  placeholder="Mohammed"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">Nom *</label>
                <Input
                  value={newPatient.last_name}
                  onChange={(e) => setNewPatient({ ...newPatient, last_name: e.target.value })}
                  placeholder="Alami"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Téléphone *</label>
              <Input
                type="tel"
                value={newPatient.phone}
                onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                placeholder="06 12 34 56 78"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Notes (optionnel)</label>
              <textarea
                value={newPatient.notes}
                onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                placeholder="Antécédents, observations…"
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            {addError && <p className="text-sm text-red-500 bg-red-50 p-2.5 rounded-lg">{addError}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} className="flex-1">
                Annuler
              </Button>
              <Button type="submit" disabled={addingPatient} className="flex-1">
                {addingPatient ? 'Ajout…' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modale historique patient */}
      <Dialog open={!!selectedPatient} onOpenChange={(o) => !o && setSelectedPatient(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedPatient && (
                <>
                  <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold text-sm">
                    {getInitials(selectedPatient.first_name, selectedPatient.last_name)}
                  </div>
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedPatient && (
            <div className="space-y-4">
              {/* Infos contact */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-3.5 w-3.5" />
                  {selectedPatient.phone}
                </p>
              </div>

              {/* Alerte allergies — visible immédiatement à l'ouverture */}
              {editAllergies.trim() && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-semibold text-red-700">Allergies : </span>
                    <span className="text-red-600">{editAllergies}</span>
                  </div>
                </div>
              )}

              {/* Stats présence */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <UserCheck className="h-4 w-4 text-green-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-green-700">{selectedPatient.present_count}</p>
                  <p className="text-xs text-green-600">Présences</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <Clock className="h-4 w-4 text-orange-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-orange-700">{selectedPatient.late_count}</p>
                  <p className="text-xs text-orange-600">Retards</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <UserX className="h-4 w-4 text-red-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-red-700">{selectedPatient.absent_count}</p>
                  <p className="text-xs text-red-600">Absences</p>
                </div>
              </div>

              {/* Fiche patient */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Fiche patient (privée)</h4>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500">Âge</label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    placeholder="Ex: 35"
                    className="w-28"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> Allergies
                  </label>
                  <textarea
                    value={editAllergies}
                    onChange={(e) => setEditAllergies(e.target.value)}
                    placeholder="Ex: Pénicilline, arachides…"
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 flex items-center gap-1.5">
                    <HeartPulse className="h-3.5 w-3.5 text-orange-400" /> Antécédents / maladies chroniques
                  </label>
                  <textarea
                    value={editChronic}
                    onChange={(e) => setEditChronic(e.target.value)}
                    placeholder="Ex: Diabète type 2, hypertension…"
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Pill className="h-3.5 w-3.5 text-blue-400" /> Traitements en cours
                  </label>
                  <textarea
                    value={editTreatments}
                    onChange={(e) => setEditTreatments(e.target.value)}
                    placeholder="Ex: Metformine 1000mg, …"
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500">Notes / observations</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Observations diverses…"
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={savePatientNotes} disabled={saving}>
                    {saving ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sauvegarde…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Save className="h-3.5 w-3.5" /> Sauvegarder
                      </span>
                    )}
                  </Button>
                  {saved && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Sauvegardé !
                    </span>
                  )}
                </div>
              </div>

              {/* Rappel de suivi */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary-500" />
                  Rappels de suivi ({recalls.filter((r) => r.status === 'pending').length})
                </h4>

                {/* Rappels programmés */}
                {recalls.filter((r) => r.status !== 'cancelled').length > 0 && (
                  <div className="space-y-2 mb-3">
                    {recalls.filter((r) => r.status !== 'cancelled').map((r) => (
                      <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800">
                            {formatDateShort(r.due_date)}
                            {r.reason && <span className="text-gray-500"> — {r.reason}</span>}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {r.status === 'sent' ? 'Rappel envoyé' : 'En attente d’envoi'}
                          </p>
                        </div>
                        {r.status === 'pending' && (
                          <button onClick={() => cancelRecall(r.id)} className="text-gray-300 hover:text-red-500 shrink-0" title="Annuler ce rappel">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Programmer un rappel */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="date"
                    value={recallDate}
                    onChange={(e) => setRecallDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="sm:w-44"
                  />
                  <Input
                    value={recallReason}
                    onChange={(e) => setRecallReason(e.target.value)}
                    placeholder="Motif (ex : contrôle annuel)"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={addRecall} disabled={!recallDate || addingRecall} className="shrink-0">
                    <Plus className="h-4 w-4 mr-1" /> {addingRecall ? 'Ajout…' : 'Programmer'}
                  </Button>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                  Un email invitant le patient à reprendre rendez-vous sera envoyé automatiquement à la date choisie.
                </p>
              </div>

              {/* Constantes vitales — affichées selon la spécialité */}
              {enabledVitals.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary-500" />
                    Constantes ({vitals.length})
                  </h4>

                  {/* Saisie d'une mesure */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                    {VITAL_DEFS.filter((v) => enabledVitals.includes(v.key)).map((v) => (
                      <div key={v.key} className="relative">
                        <Input
                          type="number"
                          step={v.step ?? 'any'}
                          inputMode="decimal"
                          value={vitalInput[v.key] ?? ''}
                          onChange={(e) => setVitalInput((prev) => ({ ...prev, [v.key]: e.target.value }))}
                          placeholder={v.label}
                          className="pr-12 text-sm"
                          aria-label={v.label}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{v.unit}</span>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addVital} disabled={savingVital} className="mb-3">
                    <Plus className="h-4 w-4 mr-1" /> {savingVital ? 'Enregistrement…' : 'Enregistrer la mesure'}
                  </Button>

                  {/* Historique des mesures */}
                  {vitals.length > 0 && (
                    <div className="space-y-2">
                      {vitals.map((m) => {
                        const w = m.values.weight, ht = m.values.height
                        const imc = w && ht ? (w / Math.pow(ht / 100, 2)) : null
                        return (
                          <div key={m.id} className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-[11px] text-gray-400 mb-1 capitalize">{formatDateFr(m.measured_at)}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-700">
                              {VITAL_DEFS.filter((v) => m.values[v.key] != null).map((v) => (
                                <span key={v.key}><b className="font-medium">{v.label}</b> {m.values[v.key]} {v.unit}</span>
                              ))}
                              {imc && <span className="text-primary-600"><b className="font-medium">IMC</b> {imc.toFixed(1)}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Notes de consultation datées (timeline) */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-primary-500" />
                  Notes de consultation ({consultNotes.length})
                </h4>

                {/* Ajout d'une note */}
                <div className="flex gap-2 mb-3">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Ajouter une note datée (diagnostic, observation du jour…)"
                    rows={2}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                  <Button
                    size="sm"
                    onClick={addConsultNote}
                    disabled={addingNote || !newNote.trim()}
                    className="shrink-0 self-start"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Liste chronologique */}
                {consultNotes.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Aucune note pour le moment.</p>
                ) : (
                  <div className="space-y-2">
                    {consultNotes.map((n) => (
                      <div key={n.id} className="group bg-gray-50 rounded-lg p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-400 mb-0.5 capitalize">{formatDateFr(n.created_at)}</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{n.note}</p>
                        </div>
                        <button
                          onClick={() => setDeleteNoteConfirm(n)}
                          className="text-gray-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                          title="Supprimer cette note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documents du patient */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4 text-primary-500" /> Documents ({documents.length})
                  </h4>
                  <label className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${uploadingDoc ? 'opacity-50 pointer-events-none' : 'border-primary-200 text-primary-600 hover:bg-primary-50'}`}>
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingDoc ? 'Envoi…' : 'Ajouter'}
                    <input type="file" className="hidden" onChange={handleUploadDocument} disabled={uploadingDoc} />
                  </label>
                </div>
                {documents.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Aucun document. Ajoutez analyses, radios, ordonnances scannées… (max 10 Mo).</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((d) => (
                      <div key={d.id} className="group bg-gray-50 rounded-lg p-2.5 flex items-center gap-3">
                        <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
                        <button
                          onClick={() => handleDownloadDocument(d)}
                          className="flex-1 min-w-0 text-left"
                          title="Ouvrir le document"
                        >
                          <p className="text-sm text-gray-700 truncate hover:text-primary-600">{d.file_name}</p>
                          <p className="text-[11px] text-gray-400">{formatDateShort(d.created_at.slice(0, 10))}</p>
                        </button>
                        <button onClick={() => handleDownloadDocument(d)} className="text-gray-300 hover:text-primary-500 shrink-0" title="Télécharger">
                          <Download className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteDocConfirm(d)} className="text-gray-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100" title="Supprimer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Historique RDV */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Historique des rendez-vous ({patientAppointments.length})
                </h4>
                {loadingHistory ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <AppointmentList appointments={patientAppointments} onPayment={handlePatientPayment} />
                )}
              </div>

              {/* Zone de suppression */}
              <div className="border-t border-gray-100 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 border-red-200 hover:bg-red-50"
                  onClick={() => setDeleteConfirm(selectedPatient)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Supprimer ce patient
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Supprimer le patient
            </DialogTitle>
          </DialogHeader>
          {deleteConfirm && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Voulez-vous vraiment supprimer <strong>{deleteConfirm.first_name} {deleteConfirm.last_name}</strong> ?
              </p>
              <p className="text-xs text-red-500 bg-red-50 p-3 rounded-lg">
                ⚠️ Cette action est définitive. Tout l&apos;historique de rendez-vous de ce patient sera également supprimé.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1">
                  Annuler
                </Button>
                <Button
                  onClick={handleDeletePatient}
                  disabled={deleting}
                  className="flex-1 bg-red-500 hover:bg-red-600"
                >
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression d'une note de consultation */}
      <Dialog open={!!deleteNoteConfirm} onOpenChange={(o) => !o && setDeleteNoteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Supprimer la note
            </DialogTitle>
          </DialogHeader>
          {deleteNoteConfirm && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Voulez-vous vraiment supprimer cette note du {formatDateFr(deleteNoteConfirm.created_at)} ?
              </p>
              <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap break-words line-clamp-4">
                {deleteNoteConfirm.note}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDeleteNoteConfirm(null)} className="flex-1">
                  Annuler
                </Button>
                <Button
                  onClick={() => deleteConsultNote(deleteNoteConfirm.id)}
                  className="flex-1 bg-red-500 hover:bg-red-600"
                >
                  Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression d'un document */}
      <Dialog open={!!deleteDocConfirm} onOpenChange={(o) => !o && setDeleteDocConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Supprimer le document
            </DialogTitle>
          </DialogHeader>
          {deleteDocConfirm && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Supprimer définitivement <strong>{deleteDocConfirm.file_name}</strong> ?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDeleteDocConfirm(null)} className="flex-1">
                  Annuler
                </Button>
                <Button onClick={() => handleDeleteDocument(deleteDocConfirm)} className="flex-1 bg-red-500 hover:bg-red-600">
                  Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
