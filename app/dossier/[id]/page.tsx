// Dossier patient complet, imprimable (continuité + conservation légale).
// Accessible uniquement par le médecin propriétaire du patient.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateFr, formatDateShort, formatTime } from '@/lib/utils'
import { VITAL_DEFS } from '@/types'
import { PrintButton } from './PrintButton'

interface Props { params: { id: string } }
export const dynamic = 'force-dynamic'

const PAY_LABELS: Record<string, string> = {
  especes: 'Espèces', carte: 'Carte', cheque: 'Chèque', virement: 'Virement',
}
const ATT_LABELS: Record<string, string> = {
  present: 'Présent', absent: 'Absent', late: 'En retard',
}

export default async function DossierPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, ice, inpe')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  const { data: patient } = await supabase
    .from('patients')
    .select('*')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  const [aptRes, notesRes, presRes, vitalsRes, docsRes] = await Promise.all([
    supabase.from('appointments').select('*, consultation_type:consultation_types(name)')
      .eq('patient_id', patient.id).order('date', { ascending: false }).order('time', { ascending: false }),
    supabase.from('consultation_notes').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    supabase.from('prescriptions').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    supabase.from('vital_signs').select('*').eq('patient_id', patient.id).order('measured_at', { ascending: false }),
    supabase.from('patient_documents').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
  ])

  const appointments = aptRes.data ?? []
  const notes = notesRes.data ?? []
  const prescriptions = presRes.data ?? []
  const vitals = vitalsRes.data ?? []
  const documents = docsRes.data ?? []

  const aptDate = new Map<string, string>()
  for (const a of appointments) aptDate.set(a.id, `${formatDateShort(a.date)} ${formatTime(a.time)}`)
  const totalPaid = appointments.reduce((s, a) => s + (a.amount_paid ?? 0), 0)
  const vitalLabel = (k: string) => VITAL_DEFS.find((v) => v.key === k)?.label || k
  const vitalUnit = (k: string) => VITAL_DEFS.find((v) => v.key === k)?.unit || ''

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href="/patients" className="text-sm text-gray-500 hover:text-gray-700">← Retour aux patients</a>
        <PrintButton />
      </div>

      {/* Bandeau conservation — masqué à l'impression */}
      <div className="max-w-3xl mx-auto mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 print:hidden">
        💡 <strong>Gardez une copie de ce dossier</strong> (impression ou PDF). Vos données médicales vous appartiennent — une copie hors ligne vous protège en cas d&apos;indisponibilité du service.
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow-sm rounded-lg p-10 print:shadow-none print:rounded-none print:p-0 text-gray-800">
        {/* En-tête médecin */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-5 mb-6">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Dr. {doctor.name}</h1>
            <p className="text-sm text-gray-500">{doctor.specialty}</p>
            {doctor.address && <p className="text-xs text-gray-500 mt-1">{doctor.address}{doctor.city ? `, ${doctor.city}` : ''}</p>}
            {doctor.phone && <p className="text-xs text-gray-500">Tél : {doctor.phone}</p>}
            {(doctor.ice || doctor.inpe) && (
              <p className="text-[11px] text-gray-400 mt-1">
                {doctor.inpe && <span>INPE : {doctor.inpe}</span>}{doctor.ice && doctor.inpe && <span> · </span>}{doctor.ice && <span>ICE : {doctor.ice}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-base font-bold text-gray-800">DOSSIER PATIENT</h2>
            <p className="text-xs text-gray-500 mt-1">Édité le {formatDateFr(new Date())}</p>
          </div>
        </div>

        {/* Identité + dossier médical */}
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">Patient</h3>
        <div className="text-sm mb-1"><strong>{patient.first_name} {patient.last_name}</strong>{patient.age != null ? ` · ${patient.age} ans` : ''}</div>
        <div className="text-sm text-gray-600">Téléphone : {patient.phone}{patient.email ? ` · ${patient.email}` : ''}</div>
        <div className="mt-3 grid grid-cols-1 gap-1.5 text-sm">
          {patient.allergies && <div><span className="text-red-600 font-medium">Allergies :</span> {patient.allergies}</div>}
          {patient.chronic_conditions && <div><span className="text-orange-600 font-medium">Antécédents :</span> {patient.chronic_conditions}</div>}
          {patient.current_treatments && <div><span className="text-blue-600 font-medium">Traitements en cours :</span> {patient.current_treatments}</div>}
          {patient.notes && <div><span className="text-gray-500 font-medium">Notes :</span> {patient.notes}</div>}
        </div>

        {/* Rendez-vous */}
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mt-7 mb-2">Rendez-vous ({appointments.length})</h3>
        {appointments.length === 0 ? <p className="text-sm text-gray-400">Aucun rendez-vous.</p> : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
                <th className="py-1.5 font-medium">Date</th><th className="py-1.5 font-medium">Motif</th>
                <th className="py-1.5 font-medium">Présence</th><th className="py-1.5 font-medium text-right">Payé</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="py-2 whitespace-nowrap">{formatDateShort(a.date)} {formatTime(a.time)}</td>
                  <td className="py-2">{a.consultation_type?.name || a.notes || '—'}</td>
                  <td className="py-2">{a.attendance ? ATT_LABELS[a.attendance] : (a.status === 'cancelled' ? 'Annulé' : '—')}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {a.amount_paid != null
                      ? `${a.amount_paid}${a.amount_due && a.amount_due > a.amount_paid ? `/${a.amount_due}` : ''} DH${a.payment_method ? ` (${PAY_LABELS[a.payment_method] || a.payment_method})` : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Notes de consultation */}
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mt-7 mb-2">Notes de consultation ({notes.length})</h3>
        {notes.length === 0 ? <p className="text-sm text-gray-400">Aucune note.</p> : (
          <div className="space-y-2.5">
            {notes.map((n) => (
              <div key={n.id} className="text-sm">
                <span className="text-xs text-gray-400">{formatDateFr(n.created_at)}{n.appointment_id && aptDate.get(n.appointment_id) ? ` · RDV du ${aptDate.get(n.appointment_id)}` : ''}{n.signed_at ? ' · signée 🔒' : ''}</span>
                <p className="whitespace-pre-wrap break-words text-gray-700">{n.note}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ordonnances */}
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mt-7 mb-2">Ordonnances ({prescriptions.length})</h3>
        {prescriptions.length === 0 ? <p className="text-sm text-gray-400">Aucune ordonnance.</p> : (
          <div className="space-y-3">
            {prescriptions.map((p) => (
              <div key={p.id} className="text-sm border border-gray-150 rounded-lg p-3 bg-gray-50 print:bg-white">
                <span className="text-xs text-gray-400">{formatDateFr(p.created_at)}{p.appointment_id && aptDate.get(p.appointment_id) ? ` · RDV du ${aptDate.get(p.appointment_id)}` : ''}</span>
                <p className="whitespace-pre-wrap break-words text-gray-700 mt-1">{p.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Constantes */}
        {vitals.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mt-7 mb-2">Constantes ({vitals.length})</h3>
            <div className="space-y-1.5">
              {vitals.map((v) => (
                <div key={v.id} className="text-sm">
                  <span className="text-xs text-gray-400">{formatDateFr(v.measured_at)} — </span>
                  {Object.entries(v.values as Record<string, number>).map(([k, val], i) => (
                    <span key={k} className="text-gray-700">{i > 0 ? ' · ' : ''}{vitalLabel(k)} : {val} {vitalUnit(k)}</span>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mt-7 mb-2">Documents ({documents.length})</h3>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
              {documents.map((d) => (
                <li key={d.id}>{d.file_name} <span className="text-xs text-gray-400">— {formatDateShort(d.created_at.slice(0, 10))}</span></li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-1">Les fichiers eux-mêmes restent consultables dans la fiche patient en ligne.</p>
          </>
        )}

        {/* Total */}
        <div className="mt-8 pt-4 border-t-2 border-gray-800 flex justify-between items-center">
          <span className="font-bold text-gray-900">Total encaissé</span>
          <span className="font-bold text-gray-900 text-lg">{totalPaid} DH</span>
        </div>

        <p className="mt-8 text-center text-[11px] text-gray-400">Dossier généré le {formatDateFr(new Date())} via MonRDV</p>
      </div>
    </div>
  )
}
