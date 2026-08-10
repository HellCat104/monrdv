// Page de confirmation d'annulation (lecture seule — aucune mutation ici)
// L'annulation réelle se fait via un POST déclenché par un clic explicite.
import { createAdminClient } from '@/lib/supabase/server'
import { formatDateShort, formatTime } from '@/lib/utils'
import { XCircle } from 'lucide-react'
import { CancelConfirm } from './CancelConfirm'
import { displayName } from '@/lib/profession'

export const dynamic = 'force-dynamic'

export default async function AnnulerPage({ params }: { params: { token: string } }) {
  const supabase = createAdminClient()

  const { data: appointment } = await supabase
    .from('appointments')
    .select('date, time, status, doctor:doctors(name, specialty)')
    .eq('cancel_token', params.token)
    .single()

  const doctor = appointment?.doctor as any

  // Lien invalide ou déjà annulé
  if (!appointment || appointment.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border">
          <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900">Lien invalide</h1>
          <p className="text-gray-500 text-sm mt-2 mb-5">
            Ce rendez-vous a déjà été annulé ou le lien n&apos;est plus valide.
          </p>
          <a
            href="/"
            className="inline-block border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Annuler ce rendez-vous ?</h1>
        <div className="bg-gray-50 rounded-xl p-4 my-4 text-left">
          <p className="text-sm text-gray-700">
            <strong>{displayName(doctor?.name ?? '', doctor?.specialty)}</strong>
            {doctor?.specialty ? ` — ${doctor.specialty}` : ''}
          </p>
          <p className="text-sm text-gray-700 mt-1">
            {formatDateShort(appointment.date)} à {formatTime(appointment.time)}
          </p>
        </div>
        <CancelConfirm token={params.token} />
      </div>
    </div>
  )
}
