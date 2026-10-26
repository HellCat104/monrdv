'use client'

// La saisie d'un compte rendu d'endoscopie.
//
// ── CE QUE CET ÉCRAN NE FAIT PAS ────────────────────────────────────────────
//
// Il ne pré-remplit AUCUNE constatation. Les champs arrivent vides, et une
// région laissée vide n'apparaîtra pas dans le compte rendu — elle n'a pas été
// explorée, ce qui n'est pas la même chose qu'un résultat normal. Un
// formulaire qui proposerait « œsophage : sans particularité » par défaut
// ferait signer au médecin un examen qu'il n'a pas fait.
//
// Il ne calcule pas non plus la date de surveillance : elle se saisit.
//
// ── BROUILLON PUIS VALIDATION ───────────────────────────────────────────────
//
// On enregistre en brouillon autant de fois qu'on veut — une endoscopie se
// rédige souvent en deux temps, entre deux patients. La validation fige le
// document : c'est ce qui lui donne sa valeur d'archive, et le verrou est
// posé en base (déclencheur v81), pas seulement ici.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Check, Plus, Trash2, Eye } from 'lucide-react'
import { REGIONS_ENDOSCOPIE, LIBELLE_EXAMEN } from '@/lib/gastro'
import type { Polype, TypeEndoscopie } from '@/types'

interface PatientLite { id: string; first_name: string; last_name: string; age?: number | null; cin?: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Existant = Record<string, any> | null

const champ = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300'

export default function EndoscopieClient({
  doctorId, patient, appointmentId, typeInitial, existant,
}: {
  doctorId: string
  patient: PatientLite
  appointmentId: string | null
  typeInitial: TypeEndoscopie
  existant: Existant
}) {
  const supabase = createClient()
  const router = useRouter()

  const [id, setId] = useState<string | null>(existant?.id ?? null)
  const [type, setType] = useState<TypeEndoscopie>(typeInitial)
  const [date, setDate] = useState<string>(existant?.date_examen ?? new Date().toISOString().slice(0, 10))
  const [indication, setIndication] = useState(existant?.indication ?? '')
  const [conditions, setConditions] = useState(existant?.conditions ?? '')
  const [preparation, setPreparation] = useState(existant?.preparation ?? '')
  const [qualitePrep, setQualitePrep] = useState(existant?.qualite_preparation ?? '')
  const [etendue, setEtendue] = useState(existant?.etendue ?? '')
  const [qualiteVue, setQualiteVue] = useState(existant?.qualite_visualisation ?? '')
  const [observations, setObservations] = useState<Record<string, string>>(existant?.observations ?? {})
  const [lesions, setLesions] = useState(existant?.lesions ?? '')
  const [polypes, setPolypes] = useState<Polype[]>(existant?.polypes ?? [])
  const [prelevements, setPrelevements] = useState(existant?.prelevements ?? '')
  const [conclusion, setConclusion] = useState(existant?.conclusion ?? '')
  const [recommandations, setRecommandations] = useState(existant?.recommandations ?? '')
  const [surveillance, setSurveillance] = useState(existant?.surveillance_le ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const [enregistre, setEnregistre] = useState(false)

  const estColo = type === 'coloscopie'
  const regions = REGIONS_ENDOSCOPIE[type]

  function corps(statut: 'brouillon' | 'valide') {
    return {
      doctor_id: doctorId,
      patient_id: patient.id,
      appointment_id: appointmentId,
      type_examen: type,
      date_examen: date,
      indication: indication.trim() || null,
      conditions: conditions.trim() || null,
      // Les champs propres à la coloscopie ne sont pas écrits sur une
      // gastroscopie : une « qualité de préparation » sur un examen qui n'en
      // demande pas est une ligne qui ne veut rien dire.
      preparation: estColo ? (preparation.trim() || null) : null,
      qualite_preparation: estColo ? (qualitePrep.trim() || null) : null,
      etendue: estColo ? (etendue.trim() || null) : null,
      qualite_visualisation: estColo ? (qualiteVue.trim() || null) : null,
      // On ne garde que les régions RÉELLEMENT renseignées.
      observations: Object.fromEntries(
        Object.entries(observations).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v !== ''),
      ),
      lesions: lesions.trim() || null,
      polypes: polypes.filter((p) => [p.localisation, p.taille_mm, p.morphologie, p.geste].some((v) => (v ?? '').trim())),
      prelevements: prelevements.trim() || null,
      conclusion: conclusion.trim() || null,
      recommandations: recommandations.trim() || null,
      surveillance_le: surveillance || null,
      statut,
      ...(statut === 'valide' ? { valide_le: new Date().toISOString() } : {}),
    }
  }

  /** Enregistrer sans valider. Une endoscopie se rédige souvent en deux temps,
   *  entre deux patients : le brouillon doit pouvoir être repris. */
  async function enregistrerBrouillon() {
    setEnCours(true); setErreur('')
    try {
      if (id) {
        const { error } = await supabase.from('endoscopies').update(corps('brouillon')).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('endoscopies').insert(corps('brouillon')).select('id').single()
        if (error) throw error
        setId(data.id)
      }
      setEnregistre(true); setTimeout(() => setEnregistre(false), 2500)
    } catch (e) {
      const m = (e as { message?: string })?.message ?? ''
      setErreur(m.includes('relation') || m.includes('does not exist')
        ? 'Les comptes rendus d’endoscopie attendent une migration de la base (v81).'
        : 'L’enregistrement a échoué. Réessayez.')
    } finally { setEnCours(false) }
  }

  async function validerEtOuvrir() {
    if (!conclusion.trim()) {
      setErreur('La conclusion est nécessaire avant de valider : c’est elle que lit le confrère.')
      return
    }
    if (!confirm('Valider ce compte rendu ? Il ne pourra plus être modifié.')) return
    setEnCours(true); setErreur('')
    try {
      let courant = id
      if (courant) {
        const { error } = await supabase.from('endoscopies').update(corps('valide')).eq('id', courant)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('endoscopies').insert(corps('valide')).select('id').single()
        if (error) throw error
        courant = data.id
      }
      router.push(`/gastro/cr/${courant}`)
    } catch {
      setErreur('La validation a échoué. Réessayez.')
      setEnCours(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-16">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{LIBELLE_EXAMEN[type]}</h1>
          <p className="text-sm text-gray-500">{patient.first_name} {patient.last_name}{patient.age != null ? ` · ${patient.age} ans` : ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {id && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/gastro/cr/${id}`)}>
              <Eye className="h-4 w-4 mr-1.5" /> Aperçu
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={enregistrerBrouillon} disabled={enCours}>
            {enregistre ? <><Check className="h-4 w-4 mr-1.5" /> Enregistré</> : <><Save className="h-4 w-4 mr-1.5" /> Brouillon</>}
          </Button>
          <Button size="sm" onClick={validerEtOuvrir} disabled={enCours}>Valider</Button>
        </div>
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erreur}</p>}

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-gray-400">Examen</Label>
            <div className="flex gap-1.5">
              {(['gastroscopie', 'coloscopie'] as TypeEndoscopie[]).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} disabled={!!id}
                  className={`flex-1 text-xs px-2 py-2 rounded-lg border capitalize transition ${type === t ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'} ${id ? 'opacity-60' : ''}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-gray-400">Date de l’examen</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
        </div>

        <Rubrique label="Indication" value={indication} onChange={setIndication} rows={2} />
        <Rubrique label="Conditions de réalisation" value={conditions} onChange={setConditions} rows={2}
          aide="Anesthésie, matériel, opérateur, incidents éventuels" />

        {estColo && (
          <>
            <Rubrique label="Préparation colique" value={preparation} onChange={setPreparation} rows={2} />
            <Rubrique label="Qualité de la préparation" value={qualitePrep} onChange={setQualitePrep} rows={1} />
            <Rubrique label="Étendue de l’exploration" value={etendue} onChange={setEtendue} rows={1} />
            <Rubrique label="Qualité de la visualisation" value={qualiteVue} onChange={setQualiteVue} rows={1} />
          </>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-primary-600">Observations par région</h2>
          {/* Dit à l'écran, parce que c'est le point qui engage le praticien. */}
          <p className="text-[11px] text-gray-400 mt-0.5">
            Une région laissée vide n’apparaîtra pas dans le compte rendu : elle n’a pas été explorée,
            et MonRDV n’écrira jamais « normal » à votre place.
          </p>
        </div>
        {regions.map((r) => (
          <Rubrique key={r.cle} label={r.label} rows={2}
            value={observations[r.cle] ?? ''}
            onChange={(v) => setObservations((prev) => ({ ...prev, [r.cle]: v }))} />
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <Rubrique label="Lésions observées" value={lesions} onChange={setLesions} rows={3} />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-[11px] text-gray-400">Polypes</Label>
            <button type="button" onClick={() => setPolypes([...polypes, {}])}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
          {polypes.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">Aucun polype saisi.</p>
          ) : (
            <div className="space-y-2">
              {polypes.map((p, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-center">
                  <Input placeholder="Localisation" value={p.localisation ?? ''} className="h-8 text-xs"
                    onChange={(e) => majPolype(i, 'localisation', e.target.value, polypes, setPolypes)} />
                  <Input placeholder="Taille (mm)" value={p.taille_mm ?? ''} className="h-8 text-xs"
                    onChange={(e) => majPolype(i, 'taille_mm', e.target.value, polypes, setPolypes)} />
                  <Input placeholder="Morphologie" value={p.morphologie ?? ''} className="h-8 text-xs"
                    onChange={(e) => majPolype(i, 'morphologie', e.target.value, polypes, setPolypes)} />
                  <Input placeholder="Geste réalisé" value={p.geste ?? ''} className="h-8 text-xs"
                    onChange={(e) => majPolype(i, 'geste', e.target.value, polypes, setPolypes)} />
                  <button type="button" onClick={() => setPolypes(polypes.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 justify-self-start"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Rubrique label="Biopsies et prélèvements" value={prelevements} onChange={setPrelevements} rows={2} />
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <Rubrique label="Conclusion" value={conclusion} onChange={setConclusion} rows={3} />
        <Rubrique label="Recommandations et suivi" value={recommandations} onChange={setRecommandations} rows={3} />
        <div className="space-y-1">
          <Label className="text-[11px] text-gray-400">Date de surveillance proposée</Label>
          <Input type="date" value={surveillance} onChange={(e) => setSurveillance(e.target.value)} className="h-9 w-48" />
          {/* Écrit noir sur blanc : l'intervalle est une décision clinique. */}
          <p className="text-[11px] text-gray-400">
            À fixer par vous. MonRDV ne déduit aucun délai d’un diagnostic.
          </p>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        Les pièces jointes (photos, anapath) s’ajoutent depuis le dossier du patient, onglet Documents.
      </p>
    </div>
  )
}

function majPolype(
  i: number, cle: keyof Polype, valeur: string,
  polypes: Polype[], setPolypes: (p: Polype[]) => void,
) {
  const suivant = [...polypes]
  suivant[i] = { ...suivant[i], [cle]: valeur }
  setPolypes(suivant)
}

function Rubrique({ label, value, onChange, rows, aide }: {
  label: string; value: string; onChange: (v: string) => void; rows: number; aide?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-gray-400">{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={champ} />
      {aide && <p className="text-[11px] text-gray-400">{aide}</p>}
    </div>
  )
}
