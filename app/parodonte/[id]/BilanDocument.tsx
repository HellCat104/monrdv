// Mise en page du bilan parodontal. Aucun accès aux données : ce que le
// composant reçoit est exactement ce qui s'imprime.
import { formatDateFr } from '@/lib/utils'
import type { LignesEnTete } from '@/lib/document-entete'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import { PrintButton } from '../../facture/[id]/PrintButton'
import {
  resumer, lireDent, dentsMesurees, comparerDent, POCHE_PATHOLOGIQUE, type PerioTeeth,
} from '@/lib/perio'

interface Props {
  lignes: LignesEnTete
  logoUrl: string | null
  ville: string | null
  patientId: string
  patientNom: string
  date: string
  teeth: PerioTeeth
  plaque: number | null
  notes: string | null
  dateAvant: string | null
  teethAvant: PerioTeeth | null
}

export function BilanDocument({
  lignes, logoUrl, ville, patientId, patientNom, date, teeth, plaque, notes, dateAvant, teethAvant,
}: Props) {
  const res = resumer(teeth)
  const dents = dentsMesurees(teeth)

  const evolutions = teethAvant
    ? dents
        .map((d) => ({ dent: d, ...comparerDent(teethAvant[d], teeth[d]) }))
        .filter((e) => e.evolution === 'amelioration' || e.evolution === 'aggravation')
    : []
  const mieux = evolutions.filter((e) => e.evolution === 'amelioration')
  const moins = evolutions.filter((e) => e.evolution === 'aggravation')

  const Chiffre = ({ titre, valeur, sous }: { titre: string; valeur: string; sous?: string }) => (
    <div className="border border-gray-200 rounded-lg px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{titre}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{valeur}</p>
      {sous && <p className="text-[11px] text-gray-500">{sous}</p>}
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

        <h1 className="text-center text-lg font-bold tracking-wide text-gray-900 mt-8 mb-1">
          BILAN PARODONTAL
        </h1>
        <p className="text-center text-sm text-gray-600 mb-8">
          {patientNom} · <span className="capitalize">{formatDateFr(date)}</span>
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Chiffre titre="Poche maximale" valeur={res.pocheMax !== null ? `${res.pocheMax} mm` : '—'} />
          <Chiffre titre="Saignement" valeur={res.bopPourcent !== null ? `${res.bopPourcent} %` : '—'} sous="des dents relevées" />
          <Chiffre titre="Plaque" valeur={plaque !== null ? `${plaque} %` : '—'} />
        </div>

        {/* L'évolution d'abord : c'est la raison d'être du document. */}
        {dateAvant && (
          <div className="border border-gray-200 rounded-lg px-4 py-3 mb-6">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
              Évolution depuis le {formatDateFr(dateAvant)}
            </p>
            {evolutions.length === 0 ? (
              <p className="text-sm text-gray-600">Situation stable sur l&apos;ensemble des dents relevées.</p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {mieux.length > 0 && (
                  <p className="text-green-700">
                    <b>Amélioration</b> — {mieux.map((e) => `${e.dent} : ${e.avant} → ${e.apres} mm`).join(' · ')}
                  </p>
                )}
                {moins.length > 0 && (
                  <p className="text-red-700">
                    <b>Aggravation</b> — {moins.map((e) => `${e.dent} : ${e.avant} → ${e.apres} mm`).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <table className="w-full text-[13px] mb-6">
          <thead>
            <tr className="border-y border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
              <th className="py-2 pr-3 font-medium w-16">Dent</th>
              <th className="py-2 pr-3 font-medium">Poche</th>
              <th className="py-2 pr-3 font-medium">Saignement</th>
              <th className="py-2 font-medium">Mobilité</th>
            </tr>
          </thead>
          <tbody>
            {dents.map((d) => {
              const m = lireDent(teeth[d])
              const atteinte = (m.pdMax ?? 0) >= POCHE_PATHOLOGIQUE
              return (
                <tr key={d} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-semibold text-gray-800 tabular-nums">{d}</td>
                  <td className={`py-1.5 pr-3 tabular-nums ${atteinte ? 'font-bold text-red-700' : 'text-gray-700'}`}>
                    {m.pdMax !== null ? `${m.pdMax} mm` : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-700">{m.bop ? 'Oui' : '—'}</td>
                  <td className="py-1.5 text-gray-700">{m.mob ? `${m.mob}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {notes && (
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Observations</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{notes}</p>
          </div>
        )}

        <p className="text-xs text-gray-500 mb-8">
          Une poche de {POCHE_PATHOLOGIQUE} mm ou plus traduit une atteinte du tissu de soutien de la dent.
          Un suivi régulier et une hygiène quotidienne rigoureuse conditionnent le résultat du traitement.
        </p>

        <div className="flex justify-end">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-16">
              {ville ? `${ville}, le ` : 'Le '}{formatDateFr(date)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Signature et cachet</p>
          </div>
        </div>
      </div>
    </div>
  )
}
