// Mise en page de la feuille de soins imprimable. Aucun accès aux données :
// ce que le composant reçoit est exactement ce qui s'imprime.
//
// Le document est conçu pour être AGRAFÉ au formulaire de l'organisme, ou
// remis seul quand celui-ci l'accepte : il reprend l'en-tête du praticien,
// l'identité de l'assuré et du bénéficiaire, le détail des actes avec leur
// code et leur montant, le total, et l'emplacement de la signature et du
// cachet. Il ne porte AUCUN numéro de facture : la recette est déjà portée
// par l'encaissement, et deux documents numérotés pour une même somme
// feraient double emploi en comptabilité.
import { formatDateFr } from '@/lib/utils'
import type { LignesEnTete } from '@/lib/document-entete'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import { PrintButton } from '../../facture/[id]/PrintButton'

export interface LigneSoin {
  tooth: string | null
  code: string | null
  label: string
  amount: number
  position: number
}

interface Props {
  lignes: LignesEnTete
  logoUrl: string | null
  ville: string | null
  patientId: string
  patientNom: string
  patientCin: string | null
  organisme: string | null
  /** Intitulé imprimé du régime (« CNSS — Assurance Maladie Obligatoire »). */
  intituleOrganisme: string | null
  dateSoins: string
  items: LigneSoin[]
}

const dh = (n: number) => `${n.toLocaleString('fr-FR')} DH`

export function FeuilleDocument({
  lignes, logoUrl, ville, patientId, patientNom, patientCin,
  organisme, intituleOrganisme, dateSoins, items: itemsBruts,
}: Props) {
  const items = itemsBruts.slice().sort((a, b) => a.position - b.position)
  const total = items.reduce((t, i) => t + Number(i.amount || 0), 0)
  const avecDents = items.some((i) => !!i.tooth)

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-sm print:shadow-none p-10 print:p-0">
        <EnTeteDocument lignes={lignes} logoUrl={logoUrl} disposition="centree" />

        <h1 className="text-center text-lg font-bold tracking-wide text-gray-900 mt-8 mb-1">
          FEUILLE DE SOINS
        </h1>
        <p className="text-center text-xs text-gray-500 mb-8">
          Document à joindre à votre demande de remboursement
        </p>

        {/* L'assuré écrit lui-même sa partie, et signe dessous : le cabinet
            n'a pas à déclarer une identité qui n'est pas la sienne. On laisse
            donc des lignes, pas des valeurs. */}
        <div className="grid grid-cols-2 gap-6 text-sm mb-8">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
              Assuré(e){intituleOrganisme ? ` · ${intituleOrganisme}` : organisme ? ` · ${organisme}` : ''}
            </p>
            <p className="text-gray-400">Nom, n° d&apos;assuré et adresse : à compléter par l&apos;assuré(e).</p>
            <p className="border-b border-dotted border-gray-400 h-5 mt-2" />
            <p className="border-b border-dotted border-gray-400 h-5 mt-2" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Bénéficiaire des soins</p>
            <p className="font-semibold text-gray-900">{patientNom}</p>
            {patientCin && <p className="text-gray-600">CIN : {patientCin}</p>}
          </div>
        </div>

        <p className="text-sm text-gray-700 mb-3">
          <span className="text-gray-500">Soins dispensés le </span>
          <span className="font-semibold capitalize">{formatDateFr(dateSoins)}</span>
        </p>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-y border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
              {avecDents && <th className="text-left py-2 w-14">Dent</th>}
              <th className="text-left py-2 w-20">Code</th>
              <th className="text-left py-2">Acte</th>
              <th className="text-right py-2 w-28">Honoraires</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100">
                {avecDents && <td className="py-2 tabular-nums">{it.tooth ?? ''}</td>}
                <td className="py-2 font-medium text-gray-700">{it.code ?? ''}</td>
                <td className="py-2 text-gray-800">{it.label}</td>
                <td className="py-2 text-right tabular-nums">{dh(Number(it.amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={avecDents ? 3 : 2} className="pt-3 text-right font-semibold text-gray-700">
                Total des honoraires
              </td>
              <td className="pt-3 text-right font-bold text-gray-900 tabular-nums">{dh(total)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="text-xs text-gray-500 mb-10">
          Je soussigné(e), praticien désigné en en-tête, certifie avoir dispensé les soins
          détaillés ci-dessus et en avoir perçu les honoraires.
        </p>

        <div className="flex justify-end">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-16">
              {ville ? `${ville}, le ` : 'Le '}{formatDateFr(dateSoins)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Signature et cachet</p>
          </div>
        </div>

        <p className="mt-10 pt-4 border-t border-gray-100 text-[10px] text-gray-400 text-center">
          Ce document n&apos;est ni une facture ni un reçu : il atteste des soins dispensés
          en vue d&apos;un remboursement.
        </p>
      </div>
    </div>
  )
}
