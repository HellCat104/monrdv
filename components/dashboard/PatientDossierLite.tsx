'use client'

// Fiche patient « forfait Agenda » — volontairement minimale (CNDP) :
// nom, prénom, téléphone et notes libres. Aucune donnée de santé ni champ
// d'identité étendu (naissance, CIN, mutuelle…) : tout cela relève du
// forfait Cabinet complet (voir PatientDossier.tsx).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getInitials, formatDateFr } from '@/lib/utils'
import { STATUS_LABELS, type Patient, type AppointmentStatus } from '@/types'
import { ArrowLeft, Phone, Save, Check, Calendar } from 'lucide-react'

interface LiteAppointment {
  id: string
  date: string
  time: string
  status: AppointmentStatus
  notes: string | null
}

export default function PatientDossierLite({ initialPatient }: { initialPatient: Patient }) {
  const supabase = createClient()
  const router = useRouter()
  const patient = initialPatient

  const [editFirstName, setEditFirstName] = useState(patient.first_name ?? '')
  const [editLastName, setEditLastName] = useState(patient.last_name ?? '')
  const [editPhone, setEditPhone] = useState(patient.phone ?? '')
  const [editNotes, setEditNotes] = useState(patient.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [appointments, setAppointments] = useState<LiteAppointment[]>([])

  useEffect(() => {
    supabase
      .from('appointments')
      .select('id, date, time, status, notes')
      .eq('patient_id', patient.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(50)
      .then(({ data }) => setAppointments((data ?? []) as LiteAppointment[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id])

  async function handleSave() {
    if (!editFirstName.trim() || !editLastName.trim() || !editPhone.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('patients')
      .update({
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.trim(),
        notes: editNotes.trim() || null,
      })
      .eq('id', patient.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => router.push('/patients')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux patients
      </button>

      {/* Identité */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-lg">
            {getInitials(patient.first_name ?? '', patient.last_name ?? '')}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {patient.first_name} {patient.last_name}
            </h1>
            {patient.phone && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {patient.phone}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="lite-first">Prénom *</Label>
            <Input id="lite-first" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="lite-last">Nom *</Label>
            <Input id="lite-last" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lite-phone">Téléphone *</Label>
            <Input id="lite-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lite-notes">Notes</Label>
            <textarea
              id="lite-notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={4}
              placeholder="Ex. préfère le matin, à rappeler pour confirmer…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saved ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {saved ? 'Enregistré' : saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {/* Historique des rendez-vous (sans contenu médical) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-primary-600" /> Rendez-vous
        </h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun rendez-vous pour ce patient.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {appointments.map((apt) => (
              <li key={apt.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-900">
                  {formatDateFr(apt.date)} · {apt.time?.slice(0, 5)}
                </span>
                <span className="text-gray-500 truncate flex-1">{apt.notes ?? ''}</span>
                <span className="text-xs font-medium text-gray-500 shrink-0">
                  {STATUS_LABELS[apt.status] ?? apt.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
