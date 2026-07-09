// Agenda du jour pour la secrétaire (lecture). Données via client admin après
// vérification des permissions (RLS contournée volontairement, accès contrôlé ici).
import { getStaffContext } from '@/lib/cabinet'
import { createAdminClient } from '@/lib/supabase/server'
import { getNowInMaroc, formatTime } from '@/lib/utils'
import { format } from 'date-fns'
import { ATTENDANCE_LABELS, ATTENDANCE_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import { Calendar } from 'lucide-react'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>

export default async function CabinetAgendaPage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.agenda) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès à l’agenda. Demandez au médecin d’activer cette permission.</p>
  }

  const today = format(getNowInMaroc(), 'yyyy-MM-dd')
  const admin = createAdminClient()
  const { data } = await admin
    .from('appointments')
    .select('id, time, status, attendance, amount_paid, amount_due, payment_method, notes, consultation_type:consultation_types(name), patient:patients(first_name, last_name, phone)')
    .eq('doctor_id', ctx.doctor.id)
    .eq('date', today)
    .order('time', { ascending: true })
  const appts = (data ?? []) as Apt[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Calendar className="h-5 w-5 text-primary-500" /> Agenda du jour</h1>
        <span className="text-sm text-gray-500 capitalize">{format(getNowInMaroc(), 'EEEE d MMMM yyyy')}</span>
      </div>

      {appts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" /> Aucun rendez-vous aujourd’hui.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {appts.map((a) => (
            <div key={a.id} className="flex items-center gap-4 p-3.5">
              <div className="text-sm font-semibold text-gray-900 w-14 shrink-0">{formatTime(a.time)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}
                  {a.status === 'cancelled' && <span className="ml-2 text-xs text-red-500">(annulé)</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {a.consultation_type?.name || a.notes || 'Consultation'}
                  {ctx.permissions.patients_contact && a.patient?.phone ? ` · ${a.patient.phone}` : ''}
                </p>
              </div>
              {a.attendance && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${ATTENDANCE_COLORS[a.attendance as keyof typeof ATTENDANCE_COLORS] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ATTENDANCE_LABELS[a.attendance as keyof typeof ATTENDANCE_LABELS] ?? a.attendance}
                </span>
              )}
              {ctx.permissions.payments && a.amount_paid != null && (
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  {a.amount_paid} DH{a.payment_method ? ` · ${PAYMENT_METHOD_LABELS[a.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? a.payment_method}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400">Version d’essai — la prise de rendez-vous et le pointage des présences depuis cet écran arrivent à l’étape suivante.</p>
    </div>
  )
}
