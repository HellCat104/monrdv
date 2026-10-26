'use client'

// La consultation de gastro-entérologie, rubrique par rubrique.
//
// ── CE QUI EST PRÉ-REMPLI, ET CE QUI NE L'EST JAMAIS ────────────────────────
//
// Pré-rempli : ce que le DOSSIER sait déjà — antécédents, allergies, dernières
// constantes. Le médecin les amende pour ce jour-là plutôt que de les retaper.
//
// Jamais pré-rempli : une constatation. Les trames par motif (reflux, douleurs
// abdominales, diarrhée chronique…) ne déposent que des INTITULÉS suivis de
// « : » — « Pyrosis : », « Dysphagie : ». Elles évitent d'oublier une
// question, elles n'y répondent pas. Une trame qui écrirait « Pyrosis : oui »
// ferait signer au praticien un symptôme qu'il n'a pas constaté.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Check, Eye, FileText } from 'lucide-react'
import { RUBRIQUES_CONSULTATION, TRAMES_CONSULTATION } from '@/lib/gastro'

interface PatientLite { id: string; first_name: string; last_name: string; age?: number | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Existant = Record<string, any> | null

export default function ConsultationClient({
  doctorId, patient, appointmentId, existant, dossier,
}: {
  doctorId: string
  patient: PatientLite
  appointmentId: string | null
  existant: Existant
  dossier: { antecedents: string; allergies: string; mesures: string }
}) {
  const supabase = createClient()
  const router = useRouter()

  const [id, setId] = useState<string | null>(existant?.id ?? null)
  const [date, setDate] = useState<string>(existant?.date_consultation ?? new Date().toISOString().slice(0, 10))
  const [champs, setChamps] = useState<Record<string, string>>(() => {
    const depart: Record<string, string> = {}
    for (const r of RUBRIQUES_CONSULTATION) depart[r.cle] = existant?.[r.cle] ?? ''
    // Une consultation neuve part du dossier. Une consultation reprise garde
    // ce qui y avait été écrit : on n'écrase pas le travail du médecin.
    if (!existant) {
      depart.antecedents = dossier.antecedents
      depart.allergies = dossier.allergies
      depart.mesures = dossier.mesures
    }
    return depart
  })
  const [prochainControle, setProchainControle] = useState<string>(existant?.prochain_controle ?? '')
  const [enCours, setEnCours] = useState(false)
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState('')

  const maj = (cle: string, v: string) => setChamps((prev) => ({ ...prev, [cle]: v }))

  /** Déposer une trame. On n'écrase QUE les rubriques vides : si le médecin a
   *  déjà écrit l'histoire de la maladie et choisit ensuite une trame, son
   *  texte reste. */
  function appliquerTrame(cle: string) {
    const t = TRAMES_CONSULTATION.find((x) => x.cle === cle)
    if (!t) return
    setChamps((prev) => {
      const suivant = { ...prev }
      for (const [k, v] of Object.entries(t.champs)) {
        if (!(suivant[k] ?? '').trim() && v) suivant[k] = v
      }
      return suivant
    })
  }

  function corps(statut: 'brouillon' | 'validee') {
    const base: Record<string, unknown> = {
      doctor_id: doctorId, patient_id: patient.id, appointment_id: appointmentId,
      date_consultation: date, prochain_controle: prochainControle || null, statut,
      ...(statut === 'validee' ? { validee_le: new Date().toISOString() } : {}),
    }
    for (const r of RUBRIQUES_CONSULTATION) base[r.cle] = (champs[r.cle] ?? '').trim() || null
    return base
  }

  async function enregistrer(statut: 'brouillon' | 'validee') {
    if (statut === 'validee' && !confirm('Valider cette consultation ? Elle ne pourra plus être modifiée.')) return
    setEnCours(true); setErreur('')
    try {
      let courant = id
      if (courant) {
        const { error } = await supabase.from('consultations').update(corps(statut)).eq('id', courant)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('consultations').insert(corps(statut)).select('id').single()
        if (error) throw error
        courant = data.id
        setId(courant)
      }
      if (statut === 'validee') { router.push(`/gastro/consultation/cr/${courant}`); return }
      setEnregistre(true); setTimeout(() => setEnregistre(false), 2500)
    } catch (e) {
      const m = (e as { message?: string })?.message ?? ''
      setErreur(m.includes('relation') || m.includes('does not exist')
        ? 'Les consultations structurées attendent une migration de la base (v81).'
        : 'L’enregistrement a échoué. Réessayez.')
    } finally { setEnCours(false) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-16">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Consultation</h1>
          <p className="text-sm text-gray-500">{patient.first_name} {patient.last_name}{patient.age != null ? ` · ${patient.age} ans` : ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {id && <Button variant="outline" size="sm" onClick={() => router.push(`/gastro/consultation/cr/${id}`)}><Eye className="h-4 w-4 mr-1.5" /> Aperçu</Button>}
          <Button variant="outline" size="sm" onClick={() => enregistrer('brouillon')} disabled={enCours}>
            {enregistre ? <><Check className="h-4 w-4 mr-1.5" /> Enregistré</> : <><Save className="h-4 w-4 mr-1.5" /> Brouillon</>}
          </Button>
          <Button size="sm" onClick={() => enregistrer('validee')} disabled={enCours}>Valider</Button>
        </div>
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erreur}</p>}

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-[11px] text-gray-400">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
          </div>
          <div className="flex-1 min-w-[16rem]">
            <Label className="text-[11px] text-gray-400 flex items-center gap-1"><FileText className="h-3 w-3" /> Trame de consultation</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {TRAMES_CONSULTATION.map((t) => (
                <button key={t.cle} type="button" onClick={() => appliquerTrame(t.cle)}
                  className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition">
                  {t.nom}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Dépose les questions à poser dans les rubriques encore vides. Aucune réponse n’est pré-cochée.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        {RUBRIQUES_CONSULTATION.map((r) => (
          <div key={r.cle} className="space-y-1">
            <Label className="text-[11px] text-gray-400">{r.label}</Label>
            <textarea value={champs[r.cle] ?? ''} onChange={(e) => maj(r.cle, e.target.value)} rows={r.lignes}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300" />
            {r.aide && <p className="text-[11px] text-gray-400">{r.aide}</p>}
          </div>
        ))}

        <div className="space-y-1">
          <Label className="text-[11px] text-gray-400">Prochain contrôle</Label>
          <Input type="date" value={prochainControle} onChange={(e) => setProchainControle(e.target.value)} className="h-9 w-48" />
          <p className="text-[11px] text-gray-400">
            À fixer par vous. Depuis le dossier, « Suivis » transforme cette date en rappel.
          </p>
        </div>
      </div>
    </div>
  )
}
