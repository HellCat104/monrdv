'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DentalChart from '@/components/dashboard/DentalChart'
import GrowthChart from '@/components/dashboard/GrowthChart'
import VaccinationCard from '@/components/dashboard/VaccinationCard'
import { isDentalDoctor } from '@/lib/dental'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppointmentList, type PaymentPayload } from '@/components/dashboard/AppointmentList'
import type { Patient, Appointment, ConsultationNote, PatientDocument, Recall, VitalSign, Prescription, Certificate } from '@/types'
import { allVitalDefs, resolveEnabledVitals, MUTUELLES_MAROC, BLOOD_GROUPS, isPediatricDoctor, isPsychiatricDoctor, PSY_NOTE_TEMPLATE, type VitalDef } from '@/types'
import { CERT_TEMPLATES } from '@/lib/certificats'
import { getInitials, formatDateShort, formatDateFr, getNowInMaroc, ageFromBirthDate, formatAge } from '@/lib/utils'
import { Users, Search, Phone, Calendar, Save, Check, UserPlus, UserCheck, UserX, Clock, Trash2, AlertTriangle, HeartPulse, Pill, NotebookPen, Plus, Paperclip, Download, Upload, Activity, BellRing, X, Lock, Printer, GitMerge, ListChecks, FileText, RefreshCw, Scissors, Syringe } from 'lucide-react'

const DOC_BUCKET = 'patient-documents'

interface PatientWithStats extends Patient {
  appointment_count: number
  last_appointment_date: string | null
  present_count: number
  absent_count: number
  late_count: number
  specialties: string[]   // spécialités dans lesquelles ce patient a eu un RDV
  age?: number | null
  notes?: string | null
}

export default function PatientsPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<PatientWithStats[]>([])
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [doctorName, setDoctorName] = useState('')
  const [doctorSlug, setDoctorSlug] = useState<string>('')
  // Forfait : en 'agenda', la fiche reste minimale (pas de date de naissance — CNDP)
  const [doctorPlan, setDoctorPlan] = useState<'agenda' | 'complet'>('agenda')
  const [enabledVitals, setEnabledVitals] = useState<string[]>([])
  const [vitalDefs, setVitalDefs] = useState<VitalDef[]>(() => allVitalDefs())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'lastRdv'>('recent')
  // Sélection multiple pour export groupé
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [doctorSpecialties, setDoctorSpecialties] = useState<string[]>([])
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all')
  const [selectedPatient, setSelectedPatient] = useState<PatientWithStats | null>(null)
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editAge, setEditAge] = useState<string>('')
  const [editBirthDate, setEditBirthDate] = useState<string>('')
  const [editBloodGroup, setEditBloodGroup] = useState<string>('')
  const [editCin, setEditCin] = useState<string>('')
  const [editMutuelle, setEditMutuelle] = useState<string>('')
  const [mutuelleOther, setMutuelleOther] = useState(false)
  const [editNotes, setEditNotes] = useState<string>('')
  const [editAllergies, setEditAllergies] = useState<string>('')
  const [editChronic, setEditChronic] = useState<string>('')
  const [editSurgeries, setEditSurgeries] = useState<string>('')
  const [editTreatments, setEditTreatments] = useState<string>('')
  const [editVaccinations, setEditVaccinations] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Notes de consultation datées (timeline)
  const [consultNotes, setConsultNotes] = useState<ConsultationNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<ConsultationNote | null>(null)
  const [signNoteConfirm, setSignNoteConfirm] = useState<ConsultationNote | null>(null)

  // Ordonnances + certificats du patient
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [certOpen, setCertOpen] = useState(false)
  const [certType, setCertType] = useState('repos')
  const [certMotif, setCertMotif] = useState('')
  const [certExtra, setCertExtra] = useState('')
  const [certContent, setCertContent] = useState('')
  const [savingCert, setSavingCert] = useState(false)

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
  const [newPatient, setNewPatient] = useState({ first_name: '', last_name: '', phone: '', birth_date: '', notes: '' })
  const [addingPatient, setAddingPatient] = useState(false)
  const [addError, setAddError] = useState('')
  const [similarPatient, setSimilarPatient] = useState<PatientWithStats | null>(null)

  // Suppression d'un patient
  const [deleteConfirm, setDeleteConfirm] = useState<PatientWithStats | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fusion de fiches (doublons)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [merging, setMerging] = useState(false)

  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, name, slug, specialty, specialties, enabled_vitals, custom_vitals, plan')
      .eq('email', user.email)
      .single()

    if (!doctor) return
    setDoctorId(doctor.id)
    setDoctorName(doctor.name ?? '')
    setDoctorSlug(doctor.slug ?? '')
    setDoctorPlan(doctor.plan === 'complet' ? 'complet' : 'agenda')
    setEnabledVitals(resolveEnabledVitals(doctor.enabled_vitals, doctor.specialty))
    setVitalDefs(allVitalDefs((doctor.custom_vitals as VitalDef[] | null) ?? []))
    setDoctorSpecialties(
      ((doctor.specialties as string[] | null) ?? (doctor.specialty ? [doctor.specialty] : []))
        .filter(Boolean)
    )

    // Récupère les patients avec leurs RDV (date + présence + spécialité)
    const { data: pts } = await supabase
      .from('patients')
      .select('*, appointments(date, attendance, status, specialty)')
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
        specialties: Array.from(new Set(apts.map((a: any) => a.specialty).filter(Boolean))) as string[],
      }
    })

    setPatients(enriched)
    setLoading(false)

    // Liens profonds : on redirige vers le dossier pleine page (source unique),
    // au lieu d'ouvrir l'ancienne fenêtre — les deux affichaient des contenus
    // différents du même patient (certificats absents d'un côté, fratrie de l'autre).
    const params = new URLSearchParams(window.location.search)
    const certifId = params.get('certificat')
    const patientId = params.get('patient')
    if (certifId) router.push(`/certificat/nouveau/${certifId}`)
    else if (patientId) router.push(`/patients/${patientId}`)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openPatientHistory(patient: PatientWithStats) {
    setSelectedPatient(patient)
    setEditAge(patient.age != null ? String(patient.age) : '')
    setEditBirthDate(patient.birth_date ?? '')
    setEditBloodGroup(patient.blood_group ?? '')
    setEditCin(patient.cin ?? '')
    setEditMutuelle(patient.mutuelle ?? '')
    // Mutuelle hors liste standard → mode « Autre » (saisie libre)
    setMutuelleOther(!!patient.mutuelle && !(MUTUELLES_MAROC as readonly string[]).includes(patient.mutuelle))
    setEditNotes(patient.notes ?? '')
    setEditAllergies(patient.allergies ?? '')
    setEditChronic(patient.chronic_conditions ?? '')
    setEditSurgeries(patient.surgeries ?? '')
    setEditTreatments(patient.current_treatments ?? '')
    setEditVaccinations(patient.vaccinations ?? '')
    setNewNote(isPsychiatricDoctor(doctorSpecialties) ? PSY_NOTE_TEMPLATE : '')
    setConsultNotes([])
    setDocuments([])
    setRecalls([])
    setVitals([])
    setVitalInput({})
    setRecallDate('')
    setRecallReason('')
    setLoadingHistory(true)
    setSaved(false)

    setPrescriptions([])
    setCertificates([])
    const [aptRes, notesRes, docsRes, recallsRes, vitalsRes, presRes, certRes] = await Promise.all([
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
      supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('certificates')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false }),
    ])

    setPatientAppointments(aptRes.data ?? [])
    setConsultNotes(notesRes.data ?? [])
    setDocuments(docsRes.data ?? [])
    setRecalls(recallsRes.data ?? [])
    setVitals(vitalsRes.data ?? [])
    setPrescriptions(presRes.data ?? [])
    setCertificates(certRes.data ?? [])
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
    if (!selectedPatient || !doctorId || !newNote.trim() || newNote === PSY_NOTE_TEMPLATE) return
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
      setNewNote(isPsychiatricDoctor(doctorSpecialties) ? PSY_NOTE_TEMPLATE : '')
    }
  }

  async function deleteConsultNote(id: string) {
    const { error } = await supabase.from('consultation_notes').delete().eq('id', id)
    if (error) { alert('La suppression de la note a échoué. Réessayez.'); return }
    setConsultNotes((prev) => prev.filter((n) => n.id !== id))
    setDeleteNoteConfirm(null)
  }

  // Signe (verrouille) une note : devient non modifiable / non supprimable
  async function signConsultNote(id: string) {
    const signedAt = new Date().toISOString()
    const { error } = await supabase
      .from('consultation_notes')
      .update({ signed_at: signedAt })
      .eq('id', id)
    if (error) { alert('La signature a échoué. Réessayez.'); return }
    setConsultNotes((prev) => prev.map((n) => n.id === id ? { ...n, signed_at: signedAt } : n))
    setSignNoteConfirm(null)
  }

  // ── Ordonnances : renouvellement en 1 clic ────────────────────────────────
  async function renewPrescription(p: Prescription) {
    if (!doctorId || !selectedPatient) return
    const { data, error } = await supabase
      .from('prescriptions')
      .insert({ doctor_id: doctorId, patient_id: selectedPatient.id, appointment_id: null, content: p.content })
      .select('*')
      .single()
    if (error || !data) { alert('Échec du renouvellement'); return }
    setPrescriptions((prev) => [data, ...prev])
    window.open(`/ordonnance/p/${data.id}`, '_blank')
  }

  // ── Certificats médicaux ──────────────────────────────────────────────────
  function buildCertContent(typeKey: string, extra: string) {
    if (!selectedPatient) return ''
    const tpl = CERT_TEMPLATES.find((t) => t.key === typeKey)
    if (!tpl) return ''
    return tpl.build(
      { first_name: selectedPatient.first_name, last_name: selectedPatient.last_name, age: selectedPatient.age, cin: selectedPatient.cin },
      { name: doctorName },
      extra,
    )
  }
  function openCertDialog() {
    setCertType('repos')
    setCertMotif('')
    setCertExtra('')
    setCertContent(buildCertContent('repos', ''))
    setCertOpen(true)
  }
  function changeCertType(typeKey: string) {
    setCertType(typeKey)
    setCertExtra('')
    setCertContent(buildCertContent(typeKey, ''))
  }
  function changeCertExtra(v: string) {
    setCertExtra(v)
    setCertContent(buildCertContent(certType, v))
  }
  async function saveCertificate(print: boolean) {
    if (!doctorId || !selectedPatient || !certContent.trim()) return
    setSavingCert(true)
    const tpl = CERT_TEMPLATES.find((t) => t.key === certType)
    const { data, error } = await supabase
      .from('certificates')
      .insert({
        doctor_id: doctorId,
        patient_id: selectedPatient.id,
        type: certType,
        title: tpl?.title ?? 'Certificat',
        motif: certMotif.trim() || null,
        content: certContent,
      })
      .select('*')
      .single()
    setSavingCert(false)
    if (error || !data) { alert('Échec de l\'enregistrement du certificat'); return }
    setCertificates((prev) => [data, ...prev])
    setCertOpen(false)
    if (print) window.open(`/certificat/${data.id}`, '_blank')
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
      birth_date: editBirthDate || null,
      blood_group: editBloodGroup || null,
      cin: editCin.trim() ? editCin.trim().toUpperCase() : null,
      mutuelle: editMutuelle.trim() || null,
      notes: editNotes || null,
      allergies: editAllergies || null,
      chronic_conditions: editChronic || null,
      surgeries: editSurgeries || null,
      current_treatments: editTreatments || null,
      vaccinations: editVaccinations || null,
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

  async function handleAddPatient(e: React.FormEvent, force = false) {
    e.preventDefault()
    setAddError('')
    if (!doctorId) return
    if (!newPatient.first_name.trim() || !newPatient.last_name.trim() || !newPatient.phone.trim()) {
      setAddError('Prénom, nom et téléphone sont obligatoires.')
      return
    }

    // Alerte "patient similaire" : même téléphone (chiffres) ou même nom complet
    if (!force) {
      const digits = (s: string) => s.replace(/\D/g, '').replace(/^212/, '0')
      const phoneD = digits(newPatient.phone)
      const fullName = `${newPatient.first_name.trim()} ${newPatient.last_name.trim()}`.toLowerCase()
      const match = patients.find((p) =>
        (phoneD.length >= 6 && digits(p.phone) === phoneD) ||
        `${p.first_name} ${p.last_name}`.toLowerCase() === fullName
      )
      if (match) { setSimilarPatient(match); return }
    }

    setSimilarPatient(null)
    setAddingPatient(true)

    const { error } = await supabase.from('patients').insert({
      doctor_id: doctorId,
      first_name: newPatient.first_name.trim(),
      last_name: newPatient.last_name.trim(),
      phone: newPatient.phone.trim(),
      birth_date: newPatient.birth_date || null,
      age: ageFromBirthDate(newPatient.birth_date),
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
    setNewPatient({ first_name: '', last_name: '', phone: '', birth_date: '', notes: '' })
    setLoading(true)
    await load()
  }

  async function handleDeletePatient() {
    if (!deleteConfirm) return
    setDeleting(true)
    const res = await fetch(`/api/patients/${deleteConfirm.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    setDeleting(false)
    if (!res.ok) { alert(body.error || 'La suppression du patient a échoué.'); return }
    setPatients((prev) => prev.filter((p) => p.id !== deleteConfirm.id))
    setDeleteConfirm(null)
    setSelectedPatient(null)
  }

  // Fusionne la fiche "dupId" DANS la fiche ouverte (selectedPatient = conservée)
  async function handleMerge(dupId: string) {
    if (!selectedPatient) return
    if (!confirm('Fusionner ce doublon dans la fiche actuelle ? Les RDV, notes, ordonnances et documents du doublon seront déplacés ici, puis le doublon sera supprimé. Action définitive.')) return
    setMerging(true)
    const res = await fetch('/api/patients/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId: selectedPatient.id, mergeId: dupId }),
    })
    setMerging(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'La fusion a échoué. Réessayez.')
      return
    }
    setMergeOpen(false)
    setSelectedPatient(null)
    setLoading(true)
    await load()
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  function exitSelection() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  // Export "liste d'infos" : un CSV des patients sélectionnés (ouvrable dans Excel)
  function exportSelectedList() {
    const sel = patients.filter((p) => selectedIds.has(p.id))
    if (sel.length === 0) return
    const esc = (v: string | number) => {
      let s = String(v)
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const headers = ['Prénom', 'Nom', 'Téléphone', 'Âge', 'Nb RDV', 'Présents', 'Absents', 'Dernier RDV']
    const rows = sel.map((p) => [p.first_name, p.last_name, p.phone, p.age ?? '', p.appointment_count, p.present_count, p.absent_count, p.last_appointment_date ?? ''])
    const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `patients-monrdv-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // Export "dossiers complets" : un ZIP avec le dossier de chaque patient sélectionné
  async function exportSelectedDossiers() {
    if (selectedIds.size === 0) return
    setExporting(true)
    try {
      const res = await fetch('/api/dossier/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Échec du téléchargement des dossiers.')
        return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `dossiers-patients-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
    } catch {
      alert('Erreur réseau pendant l\'export.')
    } finally {
      setExporting(false)
    }
  }

  const filtered = patients
    .filter((p) => specialtyFilter === 'all' || p.specialties.includes(specialtyFilter))
    .filter((p) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q) ||
        p.phone.includes(q)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'fr', { sensitivity: 'base' })
      }
      if (sortBy === 'lastRdv') {
        return (b.last_appointment_date ?? '').localeCompare(a.last_appointment_date ?? '')
      }
      // recent : par date de création (ordre de chargement déjà desc)
      return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    })

  // Psychiatre : dossier épuré (pas de groupe sanguin / vaccins / constantes)
  const isPsy = isPsychiatricDoctor(doctorSpecialties)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="text-sm text-gray-500 mt-1">{patients.length} patient(s) enregistré(s)</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selectionMode ? (
            <Button variant="outline" onClick={exitSelection}>
              Terminer
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setSelectionMode(true)} disabled={patients.length === 0}>
              <ListChecks className="h-4 w-4 mr-1.5" /> Sélectionner
            </Button>
          )}
          <Button onClick={() => { setAddError(''); setAddOpen(true) }}>
            <UserPlus className="h-4 w-4 mr-1.5" /> Ajouter un patient
          </Button>
        </div>
      </div>

      {/* Recherche + tri */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou téléphone…"
            className="pl-9"
          />
        </div>
        {doctorSpecialties.length > 1 && (
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger className="w-48 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les spécialités</SelectItem>
              {doctorSpecialties.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-48 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Ajout récent</SelectItem>
            <SelectItem value="name">Ordre alphabétique</SelectItem>
            <SelectItem value="lastRdv">Dernier rendez-vous</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Barre d'actions groupées (mode sélection) */}
      {selectionMode && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-primary-50 border border-primary-100 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-primary-700">{selectedIds.size} patient(s) sélectionné(s)</span>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportSelectedList} disabled={selectedIds.size === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Exporter la liste (Excel)
            </Button>
            {doctorPlan === 'complet' && (
              <Button variant="outline" size="sm" onClick={exportSelectedDossiers} disabled={exporting || selectedIds.size === 0}>
                <Download className="h-4 w-4 mr-1.5" /> {exporting ? 'Préparation…' : 'Télécharger les dossiers'}
              </Button>
            )}
            <button onClick={exitSelection} className="text-xs text-gray-400 hover:text-gray-600 px-1">
              Annuler
            </button>
          </div>
        </div>
      )}

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
              className={`cursor-pointer hover:border-primary-200 hover:shadow-sm transition-all ${selectionMode && selectedIds.has(patient.id) ? 'border-primary-300 bg-primary-50/40' : ''}`}
              onClick={() => selectionMode ? toggleSelect(patient.id) : router.push(`/patients/${patient.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Case de sélection (export groupé) — visible seulement en mode sélection */}
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(patient.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(patient.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 shrink-0 cursor-pointer"
                      aria-label={`Sélectionner ${patient.first_name} ${patient.last_name}`}
                    />
                  )}
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
                  onChange={(e) => { setNewPatient({ ...newPatient, first_name: e.target.value }); setSimilarPatient(null) }}
                  placeholder="Mohammed"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">Nom *</label>
                <Input
                  value={newPatient.last_name}
                  onChange={(e) => { setNewPatient({ ...newPatient, last_name: e.target.value }); setSimilarPatient(null) }}
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
                onChange={(e) => { setNewPatient({ ...newPatient, phone: e.target.value }); setSimilarPatient(null) }}
                placeholder="06 12 34 56 78"
                required
              />
            </div>
            {doctorPlan === 'complet' && (
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">
                  Date de naissance {isPediatricDoctor(doctorSpecialties) && <span className="text-primary-500">— requise pour les courbes et vaccins</span>}
                </label>
                <Input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={newPatient.birth_date}
                  onChange={(e) => setNewPatient({ ...newPatient, birth_date: e.target.value })}
                />
                {formatAge(newPatient.birth_date) && <p className="text-xs font-medium text-primary-600">👶 {formatAge(newPatient.birth_date)}</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Notes (optionnel)</label>
              <textarea
                value={newPatient.notes}
                onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                placeholder={doctorPlan === 'complet' ? 'Antécédents, observations…' : 'Ex. préfère le matin, à rappeler…'}
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            {addError && <p className="text-sm text-red-500 bg-red-50 p-2.5 rounded-lg">{addError}</p>}

            {similarPatient && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-2">
                <p className="text-amber-800">
                  ⚠️ Un patient similaire existe déjà : <strong>{similarPatient.first_name} {similarPatient.last_name}</strong> ({similarPatient.phone}). Voulez-vous ouvrir sa fiche plutôt que créer un doublon ?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const p = similarPatient
                      setAddOpen(false); setSimilarPatient(null)
                      setNewPatient({ first_name: '', last_name: '', phone: '', birth_date: '', notes: '' })
                      if (p) router.push(`/patients/${p.id}`)
                    }}
                  >
                    Ouvrir la fiche existante
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="flex-1" onClick={(e) => handleAddPatient(e as unknown as React.FormEvent, true)}>
                    Créer quand même
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setSimilarPatient(null) }} className="flex-1">
                Annuler
              </Button>
              <Button type="submit" disabled={addingPatient || !!similarPatient} className="flex-1">
                {addingPatient ? 'Ajout…' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modale historique patient */}
      <Dialog open={!!selectedPatient} onOpenChange={(o) => !o && setSelectedPatient(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
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
              {/* Fiche de synthèse « en 10 secondes » — psychiatrie */}
              {isPsychiatricDoctor(doctorSpecialties) && (() => {
                const now = getNowInMaroc()
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                const nextApt = patientAppointments
                  .filter((a) => a.date >= todayStr && a.status !== 'cancelled')
                  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0]
                // Impayé = reste à charge : un montant dû existe et n'est pas
                // entièrement réglé (inclut les paiements partiels : 150 sur 200 → 50).
                const unpaid = patientAppointments.filter((a) => a.amount_due != null && (a.amount_paid ?? 0) < a.amount_due)
                const unpaidTotal = unpaid.reduce((s, a) => s + ((a.amount_due ?? 0) - (a.amount_paid ?? 0)), 0)
                const firstLine = (t?: string | null) => (t ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || ''
                const cell = 'bg-white rounded-lg border border-gray-100 p-2.5'
                return (
                  <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3 space-y-3">
                    <h3 className="text-xs font-bold text-primary-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" /> Synthèse
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className={cell}>
                        <p className="text-[11px] text-gray-400 mb-0.5">Prochain RDV</p>
                        <p className="font-medium text-gray-800">{nextApt ? `${formatDateFr(nextApt.date)} · ${String(nextApt.time).substring(0, 5)}` : <span className="text-gray-400">Aucun programmé</span>}</p>
                      </div>
                      <div className={cell}>
                        <p className="text-[11px] text-gray-400 mb-0.5">Reste à payer</p>
                        <p className={`font-medium ${unpaid.length ? 'text-red-600' : 'text-green-600'}`}>{unpaid.length ? `${unpaidTotal} DH (${unpaid.length} RDV)` : 'À jour'}</p>
                      </div>
                      <div className={cell}>
                        <p className="text-[11px] text-gray-400 mb-0.5">Traitement en cours</p>
                        <p className="text-gray-800 line-clamp-2">{editTreatments.trim() || <span className="text-gray-400">—</span>}</p>
                      </div>
                      <div className={cell}>
                        <p className="text-[11px] text-gray-400 mb-0.5">Allergies / antécédents</p>
                        <p className="text-gray-800 line-clamp-2">
                          {editAllergies.trim() && <span className="text-red-600">{editAllergies.trim()}</span>}
                          {editAllergies.trim() && editChronic.trim() && ' · '}
                          {editChronic.trim()}
                          {!editAllergies.trim() && !editChronic.trim() && <span className="text-gray-400">—</span>}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className={cell}>
                        <p className="text-[11px] text-gray-400 mb-1">3 dernières notes</p>
                        {consultNotes.length === 0 ? <p className="text-xs text-gray-400">Aucune</p> : (
                          <ul className="space-y-1">
                            {consultNotes.slice(0, 3).map((n) => (
                              <li key={n.id} className="text-xs text-gray-600 truncate">
                                <span className="text-gray-400">{formatDateShort(n.created_at)} · </span>{firstLine(n.note) || '(vide)'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className={cell}>
                        <p className="text-[11px] text-gray-400 mb-1">Dernières ordonnances</p>
                        {prescriptions.length === 0 ? <p className="text-xs text-gray-400">Aucune</p> : (
                          <ul className="space-y-1">
                            {prescriptions.slice(0, 3).map((p) => (
                              <li key={p.id} className="text-xs text-gray-600 truncate">
                                <span className="text-gray-400">{formatDateShort(p.created_at)} · </span>{firstLine(p.content) || '—'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Infos contact + dossier complet */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-3.5 w-3.5" />
                  {selectedPatient.phone}
                </span>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {doctorPlan === 'complet' && <>
                    <a href={`/dossier/${selectedPatient.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-white border border-primary-200 rounded-lg px-3 py-1.5">
                      <Printer className="h-3.5 w-3.5" /> Voir / imprimer
                    </a>
                    <a href={`/api/dossier/${selectedPatient.id}`} className="flex items-center gap-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-3 py-1.5">
                      <Download className="h-3.5 w-3.5" /> Télécharger (PDF)
                    </a>
                  </>}
                </div>
              </div>

              {doctorPlan === 'complet' && <p className="text-[11px] text-gray-400 -mt-2 px-1">
                💡 « Télécharger (PDF) » enregistre sur votre PC le dossier complet en PDF (récapitulatif du patient). Si le patient a des radios ou documents joints, le tout est fourni dans un .zip. Vos données médicales vous appartiennent.
              </p>}

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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500">Âge</label>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value)}
                      placeholder="Ex: 35"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500">Date de naissance</label>
                    <Input
                      type="date"
                      value={editBirthDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setEditBirthDate(e.target.value)}
                    />
                  </div>
                  {!isPsy && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-500">Groupe sanguin</label>
                      <Select value={editBloodGroup || undefined} onValueChange={setEditBloodGroup}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500">CIN (carte d&apos;identité)</label>
                    <Input
                      value={editCin}
                      onChange={(e) => setEditCin(e.target.value.toUpperCase())}
                      placeholder="AB123456"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500">Mutuelle</label>
                    <Select
                      value={mutuelleOther ? 'Autre' : (editMutuelle || undefined)}
                      onValueChange={(v) => {
                        if (v === 'Autre') { setMutuelleOther(true); setEditMutuelle('') }
                        else { setMutuelleOther(false); setEditMutuelle(v) }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                      <SelectContent>
                        {MUTUELLES_MAROC.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        <SelectItem value="Autre">Autre…</SelectItem>
                      </SelectContent>
                    </Select>
                    {mutuelleOther && (
                      <Input
                        value={editMutuelle}
                        onChange={(e) => setEditMutuelle(e.target.value)}
                        placeholder="Précisez la mutuelle"
                        className="mt-1.5"
                      />
                    )}
                  </div>
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
                    <Scissors className="h-3.5 w-3.5 text-purple-400" /> Antécédents chirurgicaux
                  </label>
                  <textarea
                    value={editSurgeries}
                    onChange={(e) => setEditSurgeries(e.target.value)}
                    placeholder="Ex: Appendicectomie 2015, césarienne 2020…"
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Pill className="h-3.5 w-3.5 text-blue-400" /> Traitements de fond
                  </label>
                  <textarea
                    value={editTreatments}
                    onChange={(e) => setEditTreatments(e.target.value)}
                    placeholder="Ex: Metformine 1000mg, …"
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
                {!isPsy && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Syringe className="h-3.5 w-3.5 text-green-400" /> Vaccins / statut vaccinal
                    </label>
                    <textarea
                      value={editVaccinations}
                      onChange={(e) => setEditVaccinations(e.target.value)}
                      placeholder="Ex: DTP à jour (2024), grippe 2025, hépatite B…"
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                    />
                  </div>
                )}
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

              {/* Constantes vitales — affichées selon la spécialité (masquées en psychiatrie) */}
              {!isPsy && enabledVitals.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary-500" />
                    Constantes ({vitals.length})
                  </h4>

                  {/* Saisie d'une mesure */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                    {vitalDefs.filter((v) => enabledVitals.includes(v.key)).map((v) => (
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
                              {vitalDefs.filter((v) => m.values[v.key] != null).map((v) => (
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

              {/* Schéma dentaire — uniquement pour les dentistes */}
              {selectedPatient && doctorId && isDentalDoctor(doctorSpecialties) && (
                <DentalChart key={selectedPatient.id} patientId={selectedPatient.id} doctorId={doctorId} />
              )}

              {/* Courbe de croissance + calendrier vaccinal — pédiatres */}
              {selectedPatient && isPediatricDoctor(doctorSpecialties) && (
                editBirthDate ? (
                  <>
                    <GrowthChart key={`g-${selectedPatient.id}`} birthDate={editBirthDate} vitals={vitals} sex={selectedPatient.sex ?? null} />
                    <VaccinationCard key={`v-${selectedPatient.id}`} patientId={selectedPatient.id} birthDate={editBirthDate} initial={selectedPatient.vaccines ?? {}} />
                  </>
                ) : (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-400 italic">Renseignez la <b>date de naissance</b> ci-dessus pour afficher la courbe de croissance et le calendrier vaccinal.</p>
                  </div>
                )
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
                    placeholder={isPsy ? 'Motif / Histoire / Évolution / Traitement / Prochain RDV…' : 'Ajouter une note datée (diagnostic, observation du jour…)'}
                    rows={isPsy ? 6 : 2}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                  <Button
                    size="sm"
                    onClick={addConsultNote}
                    disabled={addingNote || !newNote.trim() || newNote === PSY_NOTE_TEMPLATE}
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
                      <div key={n.id} className={`group rounded-lg p-3 flex items-start gap-3 ${n.signed_at ? 'bg-green-50/60 border border-green-100' : 'bg-gray-50'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-[11px] text-gray-400 capitalize">{formatDateFr(n.created_at)}</span>
                            {n.signed_at && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                                <Lock className="h-2.5 w-2.5" /> Signée le {formatDateShort(n.signed_at.slice(0, 10))}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{n.note}</p>
                        </div>
                        {n.signed_at ? (
                          <Lock className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => setSignNoteConfirm(n)}
                              className="text-[11px] font-medium text-primary-600 hover:text-primary-700 hover:underline opacity-0 group-hover:opacity-100"
                              title="Signer (verrouiller) cette note"
                            >
                              Signer
                            </button>
                            <button
                              onClick={() => setDeleteNoteConfirm(n)}
                              className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Supprimer cette note"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ordonnances */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Pill className="h-4 w-4 text-primary-500" /> Ordonnances ({prescriptions.length})
                  </h4>
                  {selectedPatient && (
                    <a
                      href={`/ordonnance/patient/${selectedPatient.id}?back=${encodeURIComponent(`/patients?patient=${selectedPatient.id}`)}`}
                      className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-2.5 py-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Nouvelle ordonnance
                    </a>
                  )}
                </div>
                {prescriptions.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Aucune ordonnance. Cliquez sur « Nouvelle ordonnance » ci-dessus.</p>
                ) : (
                  <div className="space-y-2">
                    {prescriptions.map((p) => (
                      <div key={p.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-gray-400 capitalize">{formatDateFr(p.created_at)}</p>
                            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 whitespace-pre-wrap">{p.content}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={`/ordonnance/p/${p.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1"
                            >
                              <Printer className="h-3.5 w-3.5" /> Voir
                            </a>
                            <button
                              onClick={() => renewPrescription(p)}
                              className="text-xs text-gray-500 hover:text-primary-600 inline-flex items-center gap-1"
                              title="Recréer la même ordonnance datée d'aujourd'hui"
                            >
                              <RefreshCw className="h-3.5 w-3.5" /> Renouveler
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Certificats médicaux */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary-500" /> Certificats ({certificates.length})
                  </h4>
                  <Button type="button" variant="outline" size="sm" onClick={openCertDialog}>
                    <Plus className="h-4 w-4 mr-1" /> Nouveau certificat
                  </Button>
                </div>
                {certificates.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Repos, aptitude au sport, permis, courrier au confrère… ou certificat libre.</p>
                ) : (
                  <div className="space-y-2">
                    {certificates.map((ct) => (
                      <div key={ct.id} className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800">{ct.title}</p>
                          <p className="text-[11px] text-gray-400 capitalize">
                            {formatDateFr(ct.created_at)}{ct.motif ? ` · motif : ${ct.motif}` : ''}
                          </p>
                        </div>
                        <a
                          href={`/certificat/${ct.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <Printer className="h-3.5 w-3.5" /> Imprimer
                        </a>
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

              {/* Zone de gestion : fusion + suppression */}
              <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-primary-600 border-primary-200 hover:bg-primary-50"
                  onClick={() => { setMergeOpen(true); setMergeSearch('') }}
                >
                  <GitMerge className="h-3.5 w-3.5 mr-1.5" /> Fusionner un doublon
                </Button>
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

      {/* Nouveau certificat médical */}
      <Dialog open={certOpen} onOpenChange={setCertOpen}>
        <DialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary-500" />
              Nouveau certificat — {selectedPatient?.first_name} {selectedPatient?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Modèle</Label>
              <Select value={certType} onValueChange={changeCertType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CERT_TEMPLATES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const tpl = CERT_TEMPLATES.find((t) => t.key === certType)
              return tpl?.extraField ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cert_extra">{tpl.extraField.label}</Label>
                  <Input
                    id="cert_extra"
                    type={tpl.extraField.type}
                    value={certExtra}
                    onChange={(e) => changeCertExtra(e.target.value)}
                    placeholder={tpl.extraField.placeholder}
                  />
                </div>
              ) : null
            })()}

            <div className="space-y-1.5">
              <Label htmlFor="cert_motif">Motif (visible dans le dossier)</Label>
              <Input
                id="cert_motif"
                value={certMotif}
                onChange={(e) => setCertMotif(e.target.value)}
                placeholder="Ex : grippe, visite annuelle…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cert_content">Texte du certificat (modifiable)</Label>
              <textarea
                id="cert_content"
                value={certContent}
                onChange={(e) => setCertContent(e.target.value)}
                rows={12}
                className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <p className="text-[11px] text-gray-400">Le texte est figé à l&apos;enregistrement (valeur d&apos;archive) et le certificat apparaîtra dans le dossier du patient.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCertOpen(false)}>Annuler</Button>
              <Button type="button" variant="outline" onClick={() => saveCertificate(false)} disabled={savingCert || !certContent.trim()}>
                {savingCert ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button type="button" onClick={() => saveCertificate(true)} disabled={savingCert || !certContent.trim()}>
                <Printer className="h-4 w-4 mr-1.5" /> Enregistrer et imprimer
              </Button>
            </div>
          </div>
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

      {/* Fusion : choisir le doublon à fusionner dans la fiche ouverte */}
      <Dialog open={mergeOpen} onOpenChange={(o) => { setMergeOpen(o); if (!o) setMergeSearch('') }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary-500" /> Fusionner un doublon
            </DialogTitle>
          </DialogHeader>
          {selectedPatient && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Choisissez la fiche en double. Son contenu (RDV, notes, ordonnances, documents) sera déplacé dans
                <strong> {selectedPatient.first_name} {selectedPatient.last_name}</strong>, puis le doublon sera supprimé.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  placeholder="Rechercher la fiche en double…"
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {patients
                  .filter((p) => p.id !== selectedPatient.id)
                  .filter((p) => {
                    if (!mergeSearch) return true
                    const q = mergeSearch.toLowerCase()
                    return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || p.phone.includes(q)
                  })
                  .slice(0, 30)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={merging}
                      onClick={() => handleMerge(p.id)}
                      className="w-full flex items-center justify-between gap-2 text-left bg-gray-50 hover:bg-primary-50 rounded-lg px-3 py-2 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-gray-800 block truncate">{p.first_name} {p.last_name}</span>
                        <span className="text-xs text-gray-400">{p.phone} · {p.appointment_count} RDV</span>
                      </span>
                      <GitMerge className="h-4 w-4 text-primary-400 shrink-0" />
                    </button>
                  ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation signature d'une note */}
      <Dialog open={!!signNoteConfirm} onOpenChange={(o) => !o && setSignNoteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Lock className="h-5 w-5" /> Signer la note
            </DialogTitle>
          </DialogHeader>
          {signNoteConfirm && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Une fois signée, cette note sera <strong>verrouillée</strong> : elle ne pourra plus être ni modifiée ni supprimée. C&apos;est une garantie médico-légale.
              </p>
              <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap break-words line-clamp-4">
                {signNoteConfirm.note}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSignNoteConfirm(null)} className="flex-1">
                  Annuler
                </Button>
                <Button
                  onClick={() => signConsultNote(signNoteConfirm.id)}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Signer et verrouiller
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
