// Facture / reçu imprimable d'un rendez-vous payé.
// Accessible uniquement par le médecin propriétaire du RDV.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateFr, formatTime } from '@/lib/utils'
import { PrintButton } from './PrintButton'

interface Props {
  params: { id: string }
}

export const dynamic = 'force-dynamic'

export default async function FacturePage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Médecin connecté
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, email, ice, inpe')
    .eq('email', user.email)
    .single()

  if (!doctor) notFound()

  // RDV (RLS garantit déjà que le médecin ne voit que les siens, on revérifie)
  const { data: apt } = await supabase
    .from('appointments')
    .select('*, patient:patients(*), consultation_type:consultation_types(*)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()

  if (!apt) notFound()

  // Pas de facture pour un RDV non encaissé (évite une facture vide bancale)
  if (apt.amount_paid == null) redirect('/appointments')

  const numero = apt.invoice_no || `F-${apt.id.slice(0, 8).toUpperCase()}`
  const motif = apt.consultation_type?.name || apt.notes || 'Consultation médicale'
  const montant = apt.amount_paid
  // Paiement partiel : total dû vs encaissé
  const due = apt.amount_due ?? montant
  const reste = due != null && montant != null ? Math.round((due - montant) * 100) / 100 : 0
  const PAY_LABELS: Record<string, string> = { especes: 'Espèces', carte: 'Carte', cheque: 'Chèque', virement: 'Virement' }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href="/appointments" className="text-sm text-gray-500 hover:text-gray-700">← Retour à l&apos;agenda</a>
        <PrintButton />
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
                {doctor.ice && <span>ICE : {doctor.ice}</span>}
                {doctor.ice && doctor.inpe && <span> · </span>}
                {doctor.inpe && <span>INPE : {doctor.inpe}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-800">REÇU</h2>
            <p className="text-sm text-gray-500 mt-1">N° {numero}</p>
            <p className="text-sm text-gray-500">
              {apt.paid_at ? formatDateFr(apt.paid_at) : formatDateFr(apt.date)}
            </p>
          </div>
        </div>

        {/* Patient */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Patient</p>
          <p className="text-sm font-medium text-gray-900">
            {apt.patient ? `${apt.patient.first_name} ${apt.patient.last_name}` : '—'}
          </p>
        </div>

        {/* Détail */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="py-2 font-medium">Désignation</th>
              <th className="py-2 font-medium text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-3 text-gray-700">
                {motif}
                <span className="block text-xs text-gray-400 mt-0.5">
                  {formatDateFr(apt.date)} à {formatTime(apt.time)}
                </span>
              </td>
              <td className="py-3 text-gray-700 text-right whitespace-nowrap">
                {due != null ? `${due} DH` : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Total */}
        <div className="flex justify-end">
          <div className="w-64 space-y-1">
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Total</span>
              <span>{due != null ? `${due} DH` : '—'}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Encaissé{apt.payment_method ? ` (${PAY_LABELS[apt.payment_method] ?? ''})` : ''}</span>
              <span>{montant != null ? `${montant} DH` : '—'}</span>
            </div>
            {reste > 0 && (
              <div className="flex justify-between items-center py-2 border-t-2 border-gray-800">
                <span className="font-bold text-orange-700">Reste à payer</span>
                <span className="font-bold text-orange-700 text-lg">{reste} DH</span>
              </div>
            )}
            {reste <= 0 && (
              <div className="flex justify-between items-center py-2 border-t-2 border-gray-800">
                <span className="font-bold text-gray-900">Payé</span>
                <span className="font-bold text-gray-900 text-lg">{montant} DH</span>
              </div>
            )}
          </div>
        </div>

        {/* Pied de page */}
        <div className="mt-12 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            Reçu généré le {formatDateFr(new Date())} via MonRDV
          </p>
        </div>
      </div>
    </div>
  )
}
