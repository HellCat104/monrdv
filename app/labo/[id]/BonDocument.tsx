// Bon de travail de laboratoire — mise en page.
//
// C'est le document qui part avec l'empreinte. Il doit tenir sur une page, se
// lire par un prothésiste qui ne connaît pas le cabinet, et porter de quoi
// rappeler le praticien : téléphone en en-tête, et les deux dates qui
// comptent — l'envoi et le retour attendu.
import { formatDateFr } from '@/lib/utils'
import type { LignesEnTete } from '@/lib/document-entete'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import { PrintButton } from '../../facture/[id]/PrintButton'

interface Props {
  lignes: LignesEnTete
  logoUrl: string | null
  patientId: string
  /** Nom ou initiales, selon le réglage du cabinet (v68). */
  patientAffiche: string
  type: string | null
  dents: string[]
  labo: string | null
  teinte: string | null
  matiere: string | null
  instructions: string | null
  envoye: string | null
  retour: string | null
  pose: string | null
}

export function BonDocument({
  lignes, logoUrl, patientId, patientAffiche, type, dents, labo,
  teinte, matiere, instructions, envoye, retour, pose,
}: Props) {
  const Case = ({ titre, valeur }: { titre: string; valeur: string | null }) => (
    <div className="border border-gray-200 rounded-lg px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{titre}</p>
      <p className="text-sm font-semibold text-gray-900">{valeur || '—'}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-sm print:shadow-none p-10 print:p-0">
        <EnTeteDocument lignes={lignes} logoUrl={logoUrl} disposition="centree" />

        <h1 className="text-center text-lg font-bold tracking-wide text-gray-900 mt-8 mb-6">
          BON DE TRAVAIL
        </h1>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Case titre="Laboratoire" valeur={labo} />
          <Case titre="Patient" valeur={patientAffiche} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Case titre="Travail demandé" valeur={type} />
          <Case titre="Dents (FDI)" valeur={dents.join(' · ')} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Case titre="Teinte" valeur={teinte} />
          <Case titre="Matériau" valeur={matiere} />
        </div>

        {/* Les deux dates au même niveau : c'est leur écart qui fait le délai,
            et c'est ce délai que le prothésiste s'engage à tenir. */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Case titre="Envoyé le" valeur={envoye ? formatDateFr(envoye) : null} />
          <Case titre="Retour attendu" valeur={retour ? formatDateFr(retour) : null} />
          <Case titre="Pose prévue" valeur={pose ? formatDateFr(pose) : null} />
        </div>

        <div className="border border-gray-200 rounded-lg px-4 py-3 mb-8 min-h-[120px]">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Instructions</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{instructions || ''}</p>
        </div>

        <div className="flex justify-between items-end">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-12">Cachet du cabinet</p>
            <div className="w-44 border-t border-gray-300" />
          </div>
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-12">Reçu par le laboratoire</p>
            <div className="w-44 border-t border-gray-300" />
          </div>
        </div>
      </div>
    </div>
  )
}
