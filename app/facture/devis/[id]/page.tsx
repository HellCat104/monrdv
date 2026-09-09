// Facture / reçu imprimable d'UN VERSEMENT encaissé sur un devis.
//
// Une facture par versement, et non une facture unique pour tout le devis :
// c'est la règle de la comptabilité de caisse. Le patient qui paie 800 DH en
// mars ne doit pas recevoir un document de 6000 DH ; l'administration fiscale,
// elle, doit retrouver dans la série F-AAAA-NNNN exactement les sommes qui sont
// entrées en caisse, à leur date. Le document rappelle donc le plan de
// traitement complet en pied de page — pour que le patient s'y retrouve — mais
// ne facture que la somme réellement reçue ce jour-là.
import { notFound, redirect } from 'next/navigation'
import { displayName } from '@/lib/profession'
import { createClient } from '@/lib/supabase/server'
import { formatDateFr } from '@/lib/utils'
import { PrintButton } from '../../[id]/PrintButton'
import { canAccess } from '@/lib/plan'
import { quoteTotal, quotePaid, round2 } from '@/lib/devis'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/types'

interface Props { params: { id: string } }

export const dynamic = 'force-dynamic'

export default async function FactureDevisPage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, email, ice, inpe, plan')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  // Le forfait se contrôle ici aussi : la page est atteignable par son URL,
  // même quand l'interface n'affiche plus le lien qui y mène.
  if (!canAccess(doctor.plan, 'invoicing')) redirect('/appointments')

  const { data: payment } = await supabase
    .from('quote_payments')
    .select('*, patient:patients(first_name, last_name), quote:quotes(id, label)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .maybeSingle()
  if (!payment) notFound()

  const quote = payment.quote as unknown as { id: string; label: string | null } | null

  // Le plan de traitement complet et l'ensemble des versements : ils servent
  // au récapitulatif de bas de page (« où en est le patient »), jamais au
  // montant facturé, qui reste celui de CE versement.
  const [{ data: items }, { data: payments }, { data: avoir }] = await Promise.all([
    supabase.from('quote_items').select('tooth, label, unit_price, quantity')
      .eq('quote_id', payment.quote_id).order('position', { ascending: true }),
    supabase.from('quote_payments').select('amount').eq('quote_id', payment.quote_id),
    supabase.from('credit_notes').select('credit_no, amount, reason')
      .eq('quote_payment_id', payment.id).eq('doctor_id', doctor.id)
      .order('created_at', { ascending: false }).maybeSingle(),
  ])

  const total = quoteTotal(items ?? [])
  const verse = quotePaid(payments ?? [])
  const reste = round2(Math.max(0, total - verse))

  const numero = payment.invoice_no || `F-${payment.id.slice(0, 8).toUpperCase()}`
  // Sans numéro officiel, ce n'est pas une facture au sens fiscal : on parle de « reçu ».
  const docTitle = payment.invoice_no ? 'FACTURE' : 'REÇU'
  const pat = payment.patient as unknown as { first_name?: string; last_name?: string } | null

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href="/patients" className="text-sm text-gray-500 hover:text-gray-700">← Retour aux patients</a>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg p-10 print:shadow-none print:rounded-none print:p-0">
        {/* En-tête praticien */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{displayName(doctor.name, doctor.specialty)}</h1>
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
            <h2 className="text-lg font-bold text-gray-800">{docTitle}</h2>
            <p className="text-sm text-gray-500 mt-1">N° {numero}</p>
            <p className="text-sm text-gray-500">{formatDateFr(payment.paid_at)}</p>
            {avoir && (
              <p className="mt-1 inline-block text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded px-2 py-0.5">
                Annulée par l&apos;avoir {avoir.credit_no}
              </p>
            )}
          </div>
        </div>

        {/* Patient */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Patient</p>
          <p className="text-sm font-medium text-gray-900">
            {pat ? `${pat.first_name ?? ''} ${pat.last_name ?? ''}`.trim() : '—'}
          </p>
        </div>

        {/* Objet facturé : le versement, et lui seul */}
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
                Règlement — {quote?.label || 'plan de traitement'}
                <span className="block text-xs text-gray-400 mt-0.5">
                  Versement du {formatDateFr(payment.paid_at)}
                  {payment.payment_method
                    ? ` · ${PAYMENT_METHOD_LABELS[payment.payment_method as PaymentMethod] ?? payment.payment_method}`
                    : ''}
                </span>
              </td>
              <td className="py-3 text-gray-700 text-right whitespace-nowrap">
                {Number(payment.amount).toLocaleString('fr-FR')} DH
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between items-center py-2 border-t-2 border-gray-800">
              <span className="font-bold text-gray-900">Payé</span>
              <span className="font-bold text-gray-900 text-lg">
                {Number(payment.amount).toLocaleString('fr-FR')} DH
              </span>
            </div>
          </div>
        </div>

        {/* Rappel du plan de traitement — informatif, hors facture */}
        {(items ?? []).length > 0 && (
          <div className="mt-10 pt-5 border-t border-gray-100">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">
              Rappel du plan de traitement (non facturé ici)
            </p>
            <table className="w-full text-xs">
              <tbody>
                {(items ?? []).map((it: { tooth: string | null; label: string; unit_price: number; quantity: number }, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-600">
                      {it.tooth ? <span className="font-semibold">Dent {it.tooth} — </span> : null}
                      {it.label}{it.quantity > 1 ? ` × ${it.quantity}` : ''}
                    </td>
                    <td className="py-1.5 text-gray-600 text-right whitespace-nowrap">
                      {round2(Number(it.unit_price) * Number(it.quantity)).toLocaleString('fr-FR')} DH
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end mt-2">
              <div className="w-64 space-y-0.5 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>Total du plan</span><span>{total.toLocaleString('fr-FR')} DH</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Déjà versé</span><span>{verse.toLocaleString('fr-FR')} DH</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-800">
                  <span>Reste à payer</span><span>{reste.toLocaleString('fr-FR')} DH</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            {docTitle === 'FACTURE' ? 'Facture' : 'Reçu'} généré le {formatDateFr(new Date())} via MonRDV
          </p>
        </div>
      </div>
    </div>
  )
}
