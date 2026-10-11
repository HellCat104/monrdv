// Fiche de traitement orthodontique — à remettre au patient ou au correspondant.
import { formatDateFr, formatDateShort } from '@/lib/utils'
import type { LignesEnTete } from '@/lib/document-entete'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import { PrintButton } from '../../facture/[id]/PrintButton'
import {
  ORTHO_ARCADES, ORTHO_STATUT_LABELS, avancement, type OrthoTraitement,
} from '@/lib/ortho'

interface Props {
  lignes: LignesEnTete
  logoUrl: string | null
  ville: string | null
  patientNom: string
  traitement: OrthoTraitement
  aujourdhui: string
}

export function FicheDocument({ lignes, logoUrl, ville, patientNom, traitement: t, aujourdhui }: Props) {
  const av = avancement(t, aujourdhui)
  const visites = (t.visits ?? []).slice().sort((a, b) => a.visit_date.localeCompare(b.visit_date))

  const Case = ({ titre, valeur }: { titre: string; valeur: string }) => (
    <div className="border border-gray-200 rounded-lg px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{titre}</p>
      <p className="text-sm font-semibold text-gray-900">{valeur}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href={`/patients/${t.patient_id}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-sm print:shadow-none p-10 print:p-0">
        <EnTeteDocument lignes={lignes} logoUrl={logoUrl} disposition="centree" />

        <h1 className="text-center text-lg font-bold tracking-wide text-gray-900 mt-8 mb-1">
          TRAITEMENT ORTHODONTIQUE
        </h1>
        <p className="text-center text-sm text-gray-600 mb-8">{patientNom}</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Case titre="Appareil" valeur={t.appliance || '—'} />
          <Case titre="Arcades" valeur={ORTHO_ARCADES.find((a) => a.cle === t.arches)?.label ?? '—'} />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Case titre="Pose" valeur={t.started_on ? formatDateFr(t.started_on) : '—'} />
          <Case
            titre="Avancement"
            valeur={av.mois !== null ? `Mois ${av.mois}${av.prevus ? ` / ${av.prevus}` : ''}` : '—'}
          />
          <Case titre="Statut" valeur={ORTHO_STATUT_LABELS[t.status]} />
        </div>

        {(t.diagnosis || t.goals) && (
          <div className="mb-6">
            {t.diagnosis && (
              <>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Diagnostic</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap mb-3">{t.diagnosis}</p>
              </>
            )}
            {t.goals && (
              <>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Objectifs</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{t.goals}</p>
              </>
            )}
          </div>
        )}

        {/* Les séances dans l'ordre chronologique : c'est le déroulé du
            traitement, pas une liste d'actes isolés. */}
        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">Déroulé des séances</p>
        {visites.length === 0 ? (
          <p className="text-sm text-gray-500 italic mb-6">Aucune séance enregistrée.</p>
        ) : (
          <table className="w-full text-[13px] mb-6">
            <thead>
              <tr className="border-y border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="py-2 pr-3 font-medium w-24">Date</th>
                <th className="py-2 pr-3 font-medium">Acte</th>
                <th className="py-2 pr-3 font-medium">Arc</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {visites.map((v) => (
                <tr key={v.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 text-gray-600 tabular-nums">{formatDateShort(v.visit_date)}</td>
                  <td className="py-1.5 pr-3 text-gray-800">{v.act || '—'}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{v.wire || '—'}</td>
                  <td className="py-1.5 text-gray-600">{v.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex justify-end">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-16">
              {ville ? `${ville}, le ` : 'Le '}{formatDateFr(aujourdhui)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Signature et cachet</p>
          </div>
        </div>
      </div>
    </div>
  )
}
