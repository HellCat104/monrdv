import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Calendar, Clock, Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { formatDateShort, formatTime, getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
import { CancelButton } from './CancelButton'

interface AppointmentRow {
  id: string
  date: string
  time: string
  status: 'pending' | 'confirmed' | 'cancelled'
  notes: string | null
  cancel_token: string | null
  doctor: {
    id: string
    name: string
    specialty: string
    slug: string
  } | null
}

const STATUS_UI = {
  confirmed: { label: 'Confirmé',    color: 'bg-green-100 text-green-700',  Icon: CheckCircle2 },
  pending:   { label: 'En attente',  color: 'bg-yellow-100 text-yellow-700', Icon: AlertCircle },
  cancelled: { label: 'Annulé',      color: 'bg-red-100 text-red-700',      Icon: XCircle },
}

export default async function PatientDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminDb = createAdminClient()

  // Fetch only patient records explicitly linked to this authenticated user.
  const { data: patientRecords } = await adminDb
    .from('patients')
    .select('id')
    .eq('user_id', user.id)

  const patientIds = (patientRecords ?? []).map((p: { id: string }) => p.id)

  let upcoming: AppointmentRow[] = []
  let past: AppointmentRow[] = []

  if (patientIds.length > 0) {
    // Date + heure actuelles au Maroc (format comparable : yyyy-MM-ddTHH:mm:ss)
    const nowStr = format(getNowInMaroc(), "yyyy-MM-dd'T'HH:mm:ss")

    const { data: allApts } = await adminDb
      .from('appointments')
      .select('id, date, time, status, notes, cancel_token, doctor:doctors(id, name, specialty, slug)')
      .in('patient_id', patientIds)
      .order('date', { ascending: false })
      .order('time', { ascending: false })

    const apts = (allApts ?? []) as unknown as AppointmentRow[]
    // Compare date + heure (un RDV passé aujourd'hui doit aller dans l'historique)
    const dt = (a: AppointmentRow) => `${a.date}T${a.time}`
    upcoming = apts.filter((a) => dt(a) >= nowStr && a.status !== 'cancelled').reverse()
    past     = apts.filter((a) => dt(a) <  nowStr || a.status === 'cancelled')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes rendez-vous</h1>
        <p className="text-gray-500 text-sm mt-1">Retrouvez tous vos rendez-vous médicaux</p>
      </div>

      {/* CTA prendre RDV */}
      <Link
        href="/"
        className="flex items-center gap-3 bg-primary-500 hover:bg-primary-600 text-white rounded-2xl px-6 py-4 transition-colors"
      >
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <Search className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold">Prendre un nouveau rendez-vous</p>
          <p className="text-primary-100 text-sm">Trouvez un médecin disponible près de chez vous</p>
        </div>
      </Link>

      {/* Aucun RDV */}
      {patientIds.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-700">Aucun rendez-vous trouvé</p>
          <p className="text-sm text-gray-400 mt-1">
            Vos futurs rendez-vous apparaîtront ici lorsque le rendez-vous est lié à votre compte patient.
          </p>
        </div>
      )}

      {/* Rendez-vous à venir */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary-500" />
            À venir ({upcoming.length})
          </h2>
          <div className="space-y-3">
            {upcoming.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        </section>
      )}

      {/* Rendez-vous passés */}
      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            Historique ({past.length})
          </h2>
          <div className="space-y-3 opacity-80">
            {past.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} isPast />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AppointmentCard({ apt, isPast = false }: { apt: AppointmentRow; isPast?: boolean }) {
  const status = STATUS_UI[apt.status]
  const StatusIcon = status.Icon

  return (
    <div className={`bg-white rounded-2xl border p-4 sm:p-5 ${isPast ? 'border-gray-100' : 'border-primary-100 shadow-sm'}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Date block */}
        <div className={`shrink-0 rounded-xl p-2.5 sm:p-3 text-center w-12 sm:w-14 ${isPast ? 'bg-gray-100' : 'bg-primary-50'}`}>
          <p className={`text-lg sm:text-xl font-bold leading-none ${isPast ? 'text-gray-500' : 'text-primary-700'}`}>
            {new Date(apt.date + 'T00:00:00').getDate()}
          </p>
          <p className={`text-xs font-medium mt-0.5 ${isPast ? 'text-gray-400' : 'text-primary-500'}`}>
            {new Date(apt.date + 'T00:00:00').toLocaleString('fr-MA', { month: 'short' })}
          </p>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                Dr. {apt.doctor?.name ?? '—'}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">{apt.doctor?.specialty}</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${status.color}`}>
              <StatusIcon className="h-3 w-3" />
              <span className="hidden xs:inline">{status.label}</span>
            </span>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 mt-1 font-medium">
            {formatDateShort(apt.date)} · {formatTime(apt.time)}
          </p>
          {apt.notes && (
            <p className="text-xs text-gray-400 mt-1 italic truncate">"{apt.notes}"</p>
          )}

          {/* Actions */}
          {(!isPast && apt.status !== 'cancelled') && (
            <div className="flex items-center gap-3 mt-2">
              {apt.doctor?.slug && (
                <Link href={`/${apt.doctor.slug}`} className="text-xs text-primary-600 hover:underline">
                  Reprendre RDV
                </Link>
              )}
              {(apt.status === 'confirmed' || apt.status === 'pending') && (
                <CancelButton appointmentId={apt.id} cancelToken={apt.cancel_token} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
