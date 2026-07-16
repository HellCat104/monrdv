'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { formatDateFr } from '@/lib/utils'
import { Printer, Save, Check, AlertTriangle, Star, Plus, X, History } from 'lucide-react'

interface DoctorInfo {
  id: string
  name: string
  specialty: string
  address?: string | null
  city?: string | null
  phone?: string | null
  ice?: string | null
  inpe?: string | null
  cnom_number?: string | null
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
  appointmentId: string | null   // null = ordonnance hors RDV (renouvellement)
  appointmentDate: string
  existingId: string | null
  existingContent: string
  favorites: string[]            // lignes favorites du médecin
  recentLines: string[]          // lignes récemment prescrites (suggestions)
  backHref?: string
}

export function OrdonnanceEditor({
  doctor, patient, appointmentId, appointmentDate, existingId, existingContent,
  favorites: initialFavorites, recentLines, backHref = '/appointments',
}: Props) {
  const [content, setContent] = useState(existingContent)
  const [prescriptionId, setPrescriptionId] = useState<string | null>(existingId)
  const [favorites, setFavorites] = useState<string[]>(initialFavorites)
  const [newFav, setNewFav] = useState('')
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

  // Insère une ligne à la fin de l'ordonnance
  function insertLine(line: string) {
    setContent((prev) => (prev.trim() ? prev.replace(/\s+$/, '') + '\n- ' + line : '- ' + line))
  }

  async function saveFavorites(next: string[]) {
    setFavorites(next)
    await supabase.from('doctors').update({ prescription_favorites: next }).eq('id', doctor.id)
  }
  function addFavorite(line: string) {
    const clean = line.trim().replace(/^[-•*]\s*/, '')
    if (!clean || favorites.some((f) => f.toLowerCase() === clean.toLowerCase())) return
    saveFavorites([...favorites, clean])
    setNewFav('')
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="max-w-5xl mx-auto mb-4 flex items-center justify-between gap-2 print:hidden">
        <a href={backHref} className="text-sm text-gray-500 hover:text-gray-700">← Retour</a>
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

      <div className="max-w-5xl mx-auto flex gap-4 items-start print:block">
        {/* Feuille A4 */}
        <div className="flex-1 bg-white shadow-sm rounded-lg px-12 py-10 print:shadow-none print:rounded-none print:px-0 print:py-0">
          {/* En-tête médecin — centré */}
          <header className="text-center border-b-2 border-gray-800 pb-4 mb-8">
            <h1 className="text-lg font-bold tracking-tight text-gray-900">Dr. {doctor.name}</h1>
            {doctor.specialty && <p className="text-[13px] text-gray-600 mt-0.5">{doctor.specialty}</p>}
            <p className="text-xs text-gray-500 mt-2">
              {[doctor.address, doctor.city].filter(Boolean).join(', ')}
              {doctor.phone && `${(doctor.address || doctor.city) ? ' · ' : ''}Tél : ${doctor.phone}`}
            </p>
            {(doctor.cnom_number || doctor.ice || doctor.inpe) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {[doctor.cnom_number && `Ordre : ${doctor.cnom_number}`, doctor.inpe && `INPE : ${doctor.inpe}`, doctor.ice && `ICE : ${doctor.ice}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </header>

          {/* Titre du document — centré avec filet */}
          <div className="text-center mb-6">
            <h2 className="inline-block text-sm font-bold uppercase tracking-[0.18em] text-gray-900 border-b-2 border-gray-800 pb-1">
              Ordonnance
            </h2>
          </div>

          {/* Lieu, date et patient */}
          <div className="mb-8">
            <p className="text-[13px] text-gray-600 text-right mb-3">
              {doctor.city ? `${doctor.city}, le ` : 'Le '}{formatDateFr(appointmentDate)}
            </p>
            <p className="text-[13px] text-gray-800">
              <span className="text-gray-500">Patient : </span>
              <span className="font-semibold">{patient.first_name} {patient.last_name}</span>
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
            className="w-full text-[13px] text-gray-800 leading-relaxed border border-gray-200 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 print:hidden"
          />
          {/* Rendu imprimé du même contenu (fiable au print) */}
          <div className="hidden print:block text-[13px] text-gray-900 leading-relaxed whitespace-pre-wrap min-h-[16rem]">
            {content}
          </div>

          {/* Signature */}
          <div className="mt-20 flex justify-end">
            <div className="text-center">
              <div className="w-52 border-t border-gray-400 pt-1.5">
                <p className="text-xs text-gray-500">Signature et cachet</p>
              </div>
            </div>
          </div>
        </div>

        {/* Panneau favoris + suggestions — masqué à l'impression */}
        <aside className="w-72 shrink-0 space-y-4 print:hidden">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
              <Star className="h-4 w-4 text-amber-400" /> Mes favoris
            </h3>
            {favorites.length === 0 && (
              <p className="text-xs text-gray-400 mb-2">Enregistrez vos lignes habituelles : un clic les ajoutera à l&apos;ordonnance.</p>
            )}
            <div className="space-y-1.5 mb-3">
              {favorites.map((f) => (
                <div key={f} className="flex items-start gap-1 group">
                  <button
                    onClick={() => insertLine(f)}
                    className="flex-1 text-left text-xs text-gray-700 bg-gray-50 hover:bg-primary-50 hover:text-primary-700 rounded-lg px-2.5 py-1.5 border border-gray-100"
                    title="Ajouter à l'ordonnance"
                  >
                    {f}
                  </button>
                  <button
                    onClick={() => saveFavorites(favorites.filter((x) => x !== f))}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 mt-1.5"
                    title="Retirer des favoris"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={newFav}
                onChange={(e) => setNewFav(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addFavorite(newFav) }}
                placeholder="Ex : Amoxicilline 1g — 2×/j, 7 j"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
              <button onClick={() => addFavorite(newFav)} className="text-primary-500 hover:text-primary-700" title="Ajouter aux favoris">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {recentLines.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
                <History className="h-4 w-4 text-primary-400" /> Récemment prescrites
              </h3>
              <div className="space-y-1.5">
                {recentLines.map((l) => (
                  <div key={l} className="flex items-start gap-1 group">
                    <button
                      onClick={() => insertLine(l)}
                      className="flex-1 text-left text-xs text-gray-600 hover:bg-primary-50 hover:text-primary-700 rounded-lg px-2.5 py-1.5 border border-transparent hover:border-primary-100"
                      title="Ajouter à l'ordonnance"
                    >
                      {l}
                    </button>
                    <button
                      onClick={() => addFavorite(l)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-amber-400 mt-1.5"
                      title="Mettre en favori"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
