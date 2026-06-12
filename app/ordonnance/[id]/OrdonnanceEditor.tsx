'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { formatDateFr } from '@/lib/utils'
import { Printer, Save, Check, AlertTriangle } from 'lucide-react'

interface DoctorInfo {
  id: string
  name: string
  specialty: string
  address?: string | null
  city?: string | null
  phone?: string | null
  ice?: string | null
  inpe?: string | null
}

interface PatientInfo {
  id: string
  first_name: string
  last_name: string
  age?: number | null
  allergies?: string | null
}

interface Props {
  doctor: DoctorInfo
  patient: PatientInfo
  appointmentId: string
  appointmentDate: string
  existingId: string | null
  existingContent: string
}

export function OrdonnanceEditor({
  doctor, patient, appointmentId, appointmentDate, existingId, existingContent,
}: Props) {
  const [content, setContent] = useState(existingContent)
  const [prescriptionId, setPrescriptionId] = useState<string | null>(existingId)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    try {
      if (prescriptionId) {
        await supabase.from('prescriptions').update({ content }).eq('id', prescriptionId)
      } else {
        const { data } = await supabase
          .from('prescriptions')
          .insert({
            doctor_id: doctor.id,
            patient_id: patient.id,
            appointment_id: appointmentId,
            content,
          })
          .select('id')
          .single()
        if (data) setPrescriptionId(data.id)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between gap-2 print:hidden">
        <a href="/appointments" className="text-sm text-gray-500 hover:text-gray-700">← Retour à l&apos;agenda</a>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Enregistrée
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!content.trim()}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimer / PDF
          </Button>
        </div>
      </div>

      {/* Feuille A4 */}
      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg p-10 print:shadow-none print:rounded-none print:p-0">
        {/* En-tête médecin */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dr. {doctor.name}</h1>
            <p className="text-sm text-gray-500">{doctor.specialty}</p>
            {doctor.address && <p className="text-sm text-gray-500 mt-1">{doctor.address}</p>}
            {doctor.city && <p className="text-sm text-gray-500">{doctor.city}</p>}
            {doctor.phone && <p className="text-sm text-gray-500 mt-1">Tél : {doctor.phone}</p>}
            {(doctor.ice || doctor.inpe) && (
              <p className="text-xs text-gray-400 mt-1">
                {doctor.inpe && <span>INPE : {doctor.inpe}</span>}
                {doctor.ice && doctor.inpe && <span> · </span>}
                {doctor.ice && <span>ICE : {doctor.ice}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-800">ORDONNANCE</h2>
            <p className="text-sm text-gray-500 mt-1">{formatDateFr(appointmentDate)}</p>
          </div>
        </div>

        {/* Patient */}
        <div className="mb-6">
          <p className="text-sm text-gray-700">
            <span className="text-gray-400">Patient : </span>
            <span className="font-medium">{patient.first_name} {patient.last_name}</span>
            {patient.age != null && <span className="text-gray-500"> · {patient.age} ans</span>}
          </p>
          {patient.allergies && patient.allergies.trim() && (
            <p className="text-sm text-red-600 mt-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span><strong>Allergies :</strong> {patient.allergies}</span>
            </p>
          )}
        </div>

        {/* Corps de l'ordonnance — éditable à l'écran (masqué à l'impression) */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={'Rédigez l\'ordonnance ici…\n\nEx :\n- Paracétamol 1000 mg — 1 comprimé 3×/jour pendant 5 jours\n- Repos 48h'}
          rows={14}
          className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 print:hidden"
        />
        {/* Rendu imprimé du même contenu (fiable au print) */}
        <div className="hidden print:block text-sm text-gray-900 leading-relaxed whitespace-pre-wrap min-h-[16rem]">
          {content}
        </div>

        {/* Signature */}
        <div className="mt-16 flex justify-end">
          <div className="text-center">
            <div className="w-48 border-t border-gray-300 pt-1">
              <p className="text-xs text-gray-400">Signature et cachet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
