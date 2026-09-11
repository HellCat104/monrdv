// Facture d'avoir imprimable. Accessible uniquement par le médecin propriétaire.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateFr } from '@/lib/utils'
import { PrintButton } from '../../facture/[id]/PrintButton'
import { canAccess } from '@/lib/plan'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'

interface Props {
  params: { id: string }
}

export const dynamic = 'force-dynamic'

export default async function AvoirPage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select(`id, plan, ${COLONNES_EN_TETE}`)
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  // Le forfait se contrôle ici aussi : la page est atteignable par son URL,
  // même quand l'interface n'affiche plus le lien qui y mène.
  if (!canAccess(doctor.plan, 'invoicing')) redirect('/appointments')

  // L'avoir (RLS garantit déjà que le médecin ne voit que les siens, on revérifie)
  const { data: credit } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!credit) notFound()

  // Logo du cabinet (v57), lu à part de la fiche : sans la migration, la
  // page s'affiche sans logo au lieu de tomber (lib/cabinet-logo-server.ts).
  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)

  const numero = credit.credit_no || `AV-${credit.id.slice(0, 8).toUpperCase()}`

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href="/appointments" className="text-sm text-gray-500 hover:text-gray-700">← Retour à l&apos;agenda</a>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg p-10 print:shadow-none print:rounded-none print:p-0">
        {/* En-tête commun (components/shared/EnTeteDocument.tsx) ; le
            cartouche de droite — titre, numéro, date, facture annulée —
            reste propre à l'avoir. */}
        <EnTeteDocument lignes={lignesEnTete(doctor)} logoUrl={logoUrl} disposition="laterale">
          <h2 className="text-lg font-bold text-red-700">FACTURE D&apos;AVOIR</h2>
          <p className="text-sm text-gray-500 mt-1">N° {numero}</p>
          <p className="text-sm text-gray-500">{formatDateFr(credit.created_at)}</p>
          <p className="text-xs text-gray-400 mt-1">Annule la facture {credit.original_invoice_no}</p>
        </EnTeteDocument>

        {/* Patient */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Patient</p>
          <p className="text-sm font-medium text-gray-900">{credit.patient_name || '—'}</p>
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
                Avoir sur facture {credit.original_invoice_no}
                {credit.reason && (
                  <span className="block text-xs text-gray-400 mt-0.5">{credit.reason}</span>
                )}
              </td>
              <td className="py-3 text-red-700 text-right whitespace-nowrap">− {credit.amount} DH</td>
            </tr>
          </tbody>
        </table>

        {/* Total */}
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between items-center py-2 border-t-2 border-gray-800">
              <span className="font-bold text-red-700">Total avoir</span>
              <span className="font-bold text-red-700 text-lg">− {credit.amount} DH</span>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">Avoir généré le {formatDateFr(new Date())} via MonRDV</p>
        </div>
      </div>
    </div>
  )
}
