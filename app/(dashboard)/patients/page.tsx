'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AppointmentList } from '@/components/dashboard/AppointmentList'
import type { Patient, Appointment } from '@/types'
import { getInitials, formatDateShort } from '@/lib/utils'
import { Users, Search, Phone, Calendar, Save, Check, UserPlus, UserCheck, UserX, Clock } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientWithStats | null>(null)
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editAge, setEditAge] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Ajout d'un patient
  const [addOpen, setAddOpen] = useState(false)
  const [newPatient, setNewPatient] = useState({ first_name: '', last_name: '', phone: '', notes: '' })
  const [addingPatient, setAddingPatient] = useState(false)
  const [addError, setAddError] = useState('')

  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: doctor } = await supabase
      .from('doctors')
      .select('id')
      .eq('email', user.email)
      .single()

    if (!doctor) return
    setDoctorId(doctor.id)

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
    setLoadingHistory(true)
    setSaved(false)

    const { data } = await supabase
      .from('appointments')
      .select('*, patient:patients(*)')
      .eq('patient_id', patient.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })

    setPatientAppointments(data ?? [])
    setLoadingHistory(false)
  }

  async function savePatientNotes() {
    if (!selectedPatient) return
    setSaving(true)
    await supabase
      .from('patients')
      .update({ age: editAge ? Number(editAge) : null, notes: editNotes || null })
      .eq('id', selectedPatient.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setPatients((prev) => prev.map((p) =>
      p.id === selectedPatient.id ? { ...p, age: editAge ? Number(editAge) : null, notes: editNotes || null } : p
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
                  <label className="text-xs text-gray-500">Notes médicales</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Antécédents, allergies, observations…"
                    rows={4}
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

              {/* Historique RDV */}
              <div>
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
                  <AppointmentList appointments={patientAppointments} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
