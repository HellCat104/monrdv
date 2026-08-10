// « Mon dossier médical » — le patient connecté voit tout ce qui le concerne :
// ordonnances, constantes, documents, infos médicales. Les notes privées du
// médecin (consultation_notes, doctor_notes) ne sont JAMAIS exposées ici.
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatDateFr, formatTime, getNowInMaroc } from '@/lib/utils'
import { allVitalDefs, type VitalDef } from '@/types'
import { VACCINE_SCHEDULE, recommendedDate } from '@/lib/vaccines'
import GrowthChart from '@/components/dashboard/GrowthChart'
import { format } from 'date-fns'
import { FolderHeart, Pill, Activity, Paperclip, HeartPulse, Download, Stethoscope, FileCheck, Baby, Syringe, Calendar } from 'lucide-react'
import { displayName } from '@/lib/profession'

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
    .select('id, first_name, last_name, birth_date, sex, gestational_age_weeks, vaccines, is_child, allergies, chronic_conditions, current_treatments, doctor:doctors(id, name, specialty, custom_vitals)')
    .eq('user_id', user.id)
  const fiches = (records ?? []) as Row[]
  const ids = fiches.map((p) => p.id)

  let prescriptions: Row[] = []
  let vitals: Row[] = []
  let documents: Row[] = []
  let certificates: Row[] = []
  let upcoming: Row[] = []
  if (ids.length > 0) {
    const todayStr = format(getNowInMaroc(), 'yyyy-MM-dd')
    const [pres, vit, docs, certs, apts] = await Promise.all([
      admin.from('prescriptions').select('id, content, created_at, patient_id').in('patient_id', ids).order('created_at', { ascending: false }),
      admin.from('vital_signs').select('id, measured_at, values, patient_id').in('patient_id', ids).order('measured_at', { ascending: false }).limit(60),
      admin.from('patient_documents').select('id, file_name, file_type, created_at, patient_id').in('patient_id', ids).order('created_at', { ascending: false }),
      // Certificats : trace uniquement (titre + motif) — jamais le contenu
      admin.from('certificates').select('id, title, motif, created_at, patient_id').in('patient_id', ids).order('created_at', { ascending: false }),
      admin.from('appointments').select('id, date, time, patient_id').in('patient_id', ids).gte('date', todayStr).neq('status', 'cancelled').order('date', { ascending: true }).order('time', { ascending: true }),
    ])
    prescriptions = pres.data ?? []
    vitals = vit.data ?? []
    documents = docs.data ?? []
    certificates = certs.data ?? []
    upcoming = apts.data ?? []
  }

  // Carnet de santé : fiches « enfant » (date de naissance connue, < 16 ans)
  const now = new Date()
  const children = fiches.filter((f) => {
    if (!f.birth_date) return false
    if (f.is_child) return true
    const age = (now.getTime() - new Date(f.birth_date + 'T00:00:00').getTime()) / (1000 * 3600 * 24 * 365.25)
    return age < 16
  })
  const today0 = new Date(); today0.setHours(0, 0, 0, 0)

  const doctorOf = (patientId: string) => fiches.find((f) => f.id === patientId)?.doctor
  // Défs de constantes : fusionne les personnalisées de tous les médecins consultés
  const vitalDefs: VitalDef[] = allVitalDefs(fiches.flatMap((f) => (f.doctor?.custom_vitals as VitalDef[] | null) ?? []))
  const vLabel = (k: string) => vitalDefs.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefs.find((v) => v.key === k)?.unit || ''

  const hasMedicalInfo = fiches.some((f) => f.allergies || f.chronic_conditions || f.current_treatments)
  const empty = ids.length === 0 || (prescriptions.length === 0 && vitals.length === 0 && documents.length === 0 && certificates.length === 0 && !hasMedicalInfo)

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

      {/* Carnet de santé numérique — enfants (< 16 ans) */}
      {children.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Baby className="h-5 w-5 text-pink-500" /> Carnet de santé
          </h2>
          <div className="space-y-4">
            {children.map((f) => {
              const done = (f.vaccines ?? {}) as Record<string, string>
              const doneCount = VACCINE_SCHEDULE.filter((v) => done[v.key]).length
              const overdue = VACCINE_SCHEDULE.filter((v) => !done[v.key] && recommendedDate(f.birth_date, v.months) < today0)
              const next = VACCINE_SCHEDULE.find((v) => !done[v.key] && recommendedDate(f.birth_date, v.months) >= today0)
              const nextApt = upcoming.find((a) => a.patient_id === f.id)
              const childVitals = vitals.filter((v) => v.patient_id === f.id)
              return (
                <div key={f.id} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-3">
                  <p className="font-semibold text-gray-900">{f.first_name} {f.last_name}
                    <span className="text-xs text-gray-400 font-normal"> · suivi par {displayName(f.doctor?.name ?? '', f.doctor?.specialty)}</span>
                  </p>

                  {/* Prochain RDV */}
                  <p className="text-sm flex items-center gap-1.5 text-gray-700">
                    <Calendar className="h-3.5 w-3.5 text-primary-500 shrink-0" />
                    {nextApt
                      ? <>Prochain rendez-vous : <b className="capitalize">{formatDateFr(nextApt.date)}</b> à {formatTime(nextApt.time)}</>
                      : <span className="text-gray-400">Aucun rendez-vous planifié.</span>}
                  </p>

                  {/* Vaccins */}
                  <div className="text-sm flex items-start gap-1.5 text-gray-700">
                    <Syringe className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                    <span>
                      <b>{doneCount}/{VACCINE_SCHEDULE.length}</b> vaccins faits.
                      {overdue.length > 0 && <span className="text-red-600"> <b>{overdue.length} en retard</b> : {overdue.map((v) => v.label).join(', ')}.</span>}
                      {next && <span className="text-gray-500"> Prochain : {next.label} (vers le {formatDateFr(recommendedDate(f.birth_date, next.months).toISOString())}).</span>}
                    </span>
                  </div>

                  {/* Courbe de croissance (lecture seule) */}
                  {childVitals.length > 0 && (
                    <GrowthChart birthDate={f.birth_date} vitals={childVitals as { measured_at: string; values: Record<string, number> }[]} sex={f.sex ?? null} gestationalWeeks={f.gestational_age_weeks ?? null} readOnly />
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Informations enregistrées par le médecin. En cas de doute sur un vaccin ou la croissance, parlez-en au pédiatre.</p>
        </section>
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
                  <Stethoscope className="h-3.5 w-3.5" /> Dossier chez {displayName(f.doctor?.name ?? '', f.doctor?.specialty)} · {f.doctor?.specialty}
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
                    {formatDateFr(p.created_at)}{doc ? ` — prescrite par ${displayName(doc.name, doc.specialty)}` : ''}
                  </p>
                  {/* Copie informative : filigrane + pas d'en-tête officiel ni d'impression */}
                  <div className="relative overflow-hidden select-none">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{p.content}</p>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                      <span className="-rotate-12 text-red-300/60 font-bold text-base sm:text-lg tracking-widest whitespace-nowrap uppercase">
                        Copie — non valable en pharmacie
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 border-t border-gray-50 pt-2">
                    Copie informative. Seul l&apos;original signé par votre médecin fait foi — pour un duplicata, adressez-vous au cabinet.
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Certificats — trace uniquement, jamais le contenu */}
      {certificates.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary-500" /> Mes certificats ({certificates.length})
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {certificates.map((ct) => {
              const doc = doctorOf(ct.patient_id)
              return (
                <div key={ct.id} className="p-3.5 sm:px-5">
                  <p className="text-sm text-gray-800">{ct.title}</p>
                  <p className="text-[11px] text-gray-400 capitalize">
                    {formatDateFr(ct.created_at)}{ct.motif ? ` · motif : ${ct.motif}` : ''}{doc ? ` · ${displayName(doc.name, doc.specialty)}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            L&apos;original vous a été remis en main propre. Pour un duplicata, adressez-vous à votre médecin.
          </p>
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
