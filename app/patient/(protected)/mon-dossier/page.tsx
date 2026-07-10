// « Mon dossier médical » — le patient connecté voit tout ce qui le concerne :
// ordonnances, constantes, documents, infos médicales. Les notes privées du
// médecin (consultation_notes, doctor_notes) ne sont JAMAIS exposées ici.
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatDateFr } from '@/lib/utils'
import { allVitalDefs, type VitalDef } from '@/types'
import { FolderHeart, Pill, Activity, Paperclip, HeartPulse, Download, Stethoscope } from 'lucide-react'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export default async function MonDossierPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  // Fiches patient liées à ce compte (une par médecin consulté)
  const { data: records } = await admin
    .from('patients')
    .select('id, first_name, last_name, allergies, chronic_conditions, current_treatments, doctor:doctors(id, name, specialty, custom_vitals)')
    .eq('user_id', user.id)
  const fiches = (records ?? []) as Row[]
  const ids = fiches.map((p) => p.id)

  let prescriptions: Row[] = []
  let vitals: Row[] = []
  let documents: Row[] = []
  if (ids.length > 0) {
    const [pres, vit, docs] = await Promise.all([
      admin.from('prescriptions').select('id, content, created_at, patient_id').in('patient_id', ids).order('created_at', { ascending: false }),
      admin.from('vital_signs').select('id, measured_at, values, patient_id').in('patient_id', ids).order('measured_at', { ascending: false }).limit(30),
      admin.from('patient_documents').select('id, file_name, file_type, created_at, patient_id').in('patient_id', ids).order('created_at', { ascending: false }),
    ])
    prescriptions = pres.data ?? []
    vitals = vit.data ?? []
    documents = docs.data ?? []
  }

  const doctorOf = (patientId: string) => fiches.find((f) => f.id === patientId)?.doctor
  // Défs de constantes : fusionne les personnalisées de tous les médecins consultés
  const vitalDefs: VitalDef[] = allVitalDefs(fiches.flatMap((f) => (f.doctor?.custom_vitals as VitalDef[] | null) ?? []))
  const vLabel = (k: string) => vitalDefs.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefs.find((v) => v.key === k)?.unit || ''

  const hasMedicalInfo = fiches.some((f) => f.allergies || f.chronic_conditions || f.current_treatments)
  const empty = ids.length === 0 || (prescriptions.length === 0 && vitals.length === 0 && documents.length === 0 && !hasMedicalInfo)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FolderHeart className="h-6 w-6 text-primary-500" /> Mon dossier médical
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Ordonnances, mesures et documents enregistrés par vos médecins sur MonRDV. Vos données vous appartiennent.
        </p>
      </div>

      {empty && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <FolderHeart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-700">Votre dossier est vide pour le moment</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Après vos consultations, les ordonnances et documents que vos médecins enregistrent apparaîtront ici automatiquement.
          </p>
        </div>
      )}

      {/* Infos médicales (par médecin) */}
      {hasMedicalInfo && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-orange-400" /> Mes informations médicales
          </h2>
          <div className="space-y-3">
            {fiches.filter((f) => f.allergies || f.chronic_conditions || f.current_treatments).map((f) => (
              <div key={f.id} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 text-sm space-y-1.5">
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" /> Dossier chez Dr. {f.doctor?.name} · {f.doctor?.specialty}
                </p>
                {f.allergies && <p className="text-red-600"><b>Allergies :</b> {f.allergies}</p>}
                {f.chronic_conditions && <p className="text-gray-700"><b>Antécédents :</b> {f.chronic_conditions}</p>}
                {f.current_treatments && <p className="text-gray-700"><b>Traitements en cours :</b> {f.current_treatments}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ordonnances */}
      {prescriptions.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary-500" /> Mes ordonnances ({prescriptions.length})
          </h2>
          <div className="space-y-3">
            {prescriptions.map((p) => {
              const doc = doctorOf(p.patient_id)
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
                  <p className="text-xs text-gray-400 mb-2 capitalize">
                    {formatDateFr(p.created_at)}{doc ? ` — Dr. ${doc.name} (${doc.specialty})` : ''}
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{p.content}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Constantes */}
      {vitals.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary-500" /> Mes mesures ({vitals.length})
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {vitals.map((v) => (
              <div key={v.id} className="p-3.5 sm:px-5">
                <p className="text-[11px] text-gray-400 capitalize">{formatDateFr(v.measured_at)}</p>
                <p className="text-sm text-gray-700 mt-0.5">
                  {Object.entries((v.values ?? {}) as Record<string, number>)
                    .map(([k, val]) => `${vLabel(k)} : ${val} ${vUnit(k)}`.trim())
                    .join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-primary-500" /> Mes documents ({documents.length})
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {documents.map((d) => (
              <a
                key={d.id}
                href={`/api/patient/document/${d.id}`}
                className="flex items-center gap-3 p-3.5 sm:px-5 hover:bg-gray-50/60 group"
              >
                <Paperclip className="h-4 w-4 text-gray-300 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-800 truncate">{d.file_name}</span>
                  <span className="block text-[11px] text-gray-400 capitalize">{formatDateFr(d.created_at)}</span>
                </span>
                <Download className="h-4 w-4 text-gray-300 group-hover:text-primary-500 shrink-0" />
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] text-gray-400">
        Ce dossier regroupe les éléments enregistrés par vos médecins sur MonRDV. Pour toute question médicale, adressez-vous directement à votre médecin.
      </p>
    </div>
  )
}
