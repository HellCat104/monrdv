// Mise en page du devis imprimable — séparée de page.tsx, qui garde pour lui
// le contrôle d'accès et la lecture en base. Ici, aucun accès aux données :
// ce que le composant reçoit est exactement ce qui s'imprime, ce qui permet
// aussi de relire le document sans base (aperçu, tests).
//
// Les règles du document — pas de numéro, échéancier prévisionnel, date
// d'émission, mention « ni facture ni reçu » — sont expliquées en tête de
// app/devis/[id]/page.tsx.
import { formatDateFr, formatDateShort } from '@/lib/utils'
import { itemTotal, quoteTotal, quotePaid, quoteRemaining, installmentsTotal, ligneValidite } from '@/lib/devis'
import type { LignesEnTete } from '@/lib/document-entete'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import { PrintButton } from '../../facture/[id]/PrintButton'
import type { QuoteStatus } from '@/types'

export interface LigneDevis { tooth: string | null; label: string; unit_price: number; quantity: number; position: number; created_at: string }
export interface EcheanceDevis { due_date: string; amount: number; label: string | null }

interface Props {
  lignes: LignesEnTete
  logoUrl: string | null
  /** Ville du cabinet, pour « Casablanca, le … ». */
  ville: string | null
  patientId: string
  patientNom: string
  intitule: string | null
  statut: QuoteStatus
  /** Date d'émission (horodatage) : remise au patient, à défaut création. */
  emission: string
  /** Texte libre du médecin (v58) — null : aucune ligne de validité. */
  validite: string | null
  items: LigneDevis[]
  /** Montants SEULS : le numéro de facture d'un versement n'a rien à faire
   *  sur un devis, il n'est donc pas même transmis. */
  versements: { amount: number }[]
  echeances: EcheanceDevis[]
}

/** Montant affiché : même format que les factures de versement. */
const dh = (n: number) => `${n.toLocaleString('fr-FR')} DH`

export function DevisDocument({
  lignes, logoUrl, ville, patientId, patientNom, intitule, statut: status, emission, validite: texteValidite,
  items: itemsBruts, versements: payments, echeances: echeancesBrutes,
}: Props) {
  // Ordre de saisie du médecin, comme dans le dossier patient.
  const items = itemsBruts.slice()
    .sort((a, b) => (a.position - b.position) || a.created_at.localeCompare(b.created_at))
  const echeances = echeancesBrutes.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))

  // Les trois montants d'un devis, calculés par lib/devis.ts — les mêmes
  // fonctions que l'écran du médecin et les factures de versement : un patient
  // ne doit jamais lire ici un reste dû différent de celui de sa facture.
  const total = quoteTotal(items)
  const verse = quotePaid(payments)
  const reste = quoteRemaining(items, payments)
  const avecDents = items.some((it) => !!it.tooth)
  // « Valable » + texte du médecin, ou null : aucune ligne (lib/devis.ts).
  const validite = ligneValidite(texteValidite)

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <a href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      {/* Brouillon : rappel à l'écran seulement. La date d'émission imprimée
          est celle du passage en « Proposé au patient » ; tant que le devis
          est un brouillon, c'est sa date de création. */}
      {status === 'brouillon' && (
        <div className="max-w-2xl mx-auto mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 print:hidden">
          Ce devis est encore un <strong>brouillon</strong>. Quand vous le remettez au patient, passez-le en
          « Proposé au patient » dans son dossier : la date du devis sera celle de ce jour-là.
        </div>
      )}

      {/* Feuille A4 */}
      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg px-12 py-10 print:shadow-none print:rounded-none print:px-0 print:py-0">
        <EnTeteDocument lignes={lignes} logoUrl={logoUrl} disposition="centree" />

        {/* Titre — centré avec filet, comme l'ordonnance et le certificat. */}
        <div className="text-center mb-6">
          <h2 className="inline-block text-sm font-bold uppercase tracking-[0.18em] text-gray-900 border-b-2 border-gray-800 pb-1">
            Devis
          </h2>
          {intitule && <p className="text-[13px] text-gray-600 mt-2">{intitule}</p>}
          {/* Devis refusé ou annulé : réimprimé, il ne doit pas passer pour
              une proposition toujours ouverte. Mention imprimée. */}
          {(status === 'annule' || status === 'refuse') && (
            <p className="mt-2 inline-block text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded px-2 py-0.5">
              {status === 'annule' ? 'Devis annulé' : 'Devis refusé par le patient'}
            </p>
          )}
        </div>

        {/* Lieu, date d'émission et patient */}
        <div className="mb-6">
          <p className="text-[13px] text-gray-600 text-right mb-3">
            {ville ? `${ville}, le ` : 'Le '}{formatDateFr(emission)}
          </p>
          <p className="text-[13px] text-gray-800">
            <span className="text-gray-500">Patient : </span>
            <span className="font-semibold">{patientNom || '—'}</span>
          </p>
        </div>

        {/* Actes proposés */}
        {items.length === 0 ? (
          <p className="text-[13px] text-gray-500 italic mb-6">Aucun acte n&apos;a encore été ajouté à ce devis.</p>
        ) : (
          <table className="w-full text-[13px] mb-2">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-500 text-xs uppercase tracking-wide">
                {avecDents && <th className="py-2 pr-3 font-medium w-14">Dent</th>}
                <th className="py-2 pr-3 font-medium">Acte</th>
                <th className="py-2 pr-3 font-medium text-center w-12">Qté</th>
                <th className="py-2 pr-3 font-medium text-right whitespace-nowrap">Prix unitaire</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100 align-top break-inside-avoid">
                  {avecDents && <td className="py-2 pr-3 font-semibold text-gray-800 tabular-nums">{it.tooth ?? ''}</td>}
                  <td className="py-2 pr-3 text-gray-800">{it.label}</td>
                  <td className="py-2 pr-3 text-center text-gray-700 tabular-nums">{it.quantity}</td>
                  <td className="py-2 pr-3 text-right text-gray-700 whitespace-nowrap tabular-nums">{dh(Number(it.unit_price))}</td>
                  <td className="py-2 text-right text-gray-900 whitespace-nowrap tabular-nums">{dh(itemTotal(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {avecDents && (
          <p className="text-[11px] text-gray-400 mb-4">Dents désignées selon la numérotation internationale FDI.</p>
        )}

        {/* Total, puis — seulement s'il y a eu des versements — ce qui a été
            reçu et ce qu'il reste. Sans versement, « Déjà versé : 0 DH »
            n'apprendrait rien au patient et alourdirait la proposition. */}
        <div className="flex justify-end mb-8 break-inside-avoid">
          <div className="w-72 space-y-1">
            <div className="flex justify-between items-center py-2 border-t-2 border-gray-800">
              <span className="font-bold text-gray-900">Total du devis</span>
              <span className="font-bold text-gray-900 text-lg tabular-nums">{dh(total)}</span>
            </div>
            {payments.length > 0 && (
              <>
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>Déjà versé à ce jour</span>
                  <span className="tabular-nums">{dh(verse)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-semibold text-gray-900">
                  <span>Reste à payer</span>
                  <span className="tabular-nums">{dh(reste)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Échéancier PRÉVISIONNEL (quote_installments) — un calendrier
            proposé, jamais une dette ni un encaissement (v54 §2). */}
        {echeances.length > 0 && (
          <div className="mb-8 break-inside-avoid">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-2">Échéancier prévisionnel</p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 text-xs">
                  <th className="py-1.5 pr-3 font-medium">Date prévue</th>
                  <th className="py-1.5 pr-3 font-medium"></th>
                  <th className="py-1.5 font-medium text-right">Montant prévu</th>
                </tr>
              </thead>
              <tbody>
                {echeances.map((e, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{formatDateShort(e.due_date)}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{e.label ?? ''}</td>
                    <td className="py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">{dh(Number(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-2">
              Calendrier indicatif de {echeances.length} échéance{echeances.length > 1 ? 's' : ''}, soit {dh(installmentsTotal(echeances))} prévus,
              proposé pour étaler le règlement. Ces montants ne sont ni des sommes dues à ce jour, ni des paiements reçus.
            </p>
          </div>
        )}

        {/* Validité — texte libre du médecin (v58), imprimé après « Valable ».
            Rien de saisi : aucune ligne (lib/devis.ts, ligneValidite). */}
        {validite && (
          <p className="text-[13px] text-gray-800 mb-8">{validite}</p>
        )}

        {/* Signatures. break-inside-avoid : la zone d'accord ne doit pas être
            coupée entre deux pages, le patient signerait sous un vide. */}
        <div className="mt-12 grid grid-cols-2 gap-10 break-inside-avoid">
          <div>
            <p className="text-xs font-semibold text-gray-700">Bon pour accord</p>
            <p className="text-[11px] text-gray-500">Date et signature du patient</p>
            <div className="mt-2 h-24 border border-gray-300 rounded" />
          </div>
          <div className="flex items-end justify-end">
            <div className="w-52 border-t border-gray-400 pt-1.5 text-center">
              <p className="text-xs text-gray-500">Signature et cachet du praticien</p>
            </div>
          </div>
        </div>

        {/* Pied de page : nature du document et date d'impression, distincte
            de la date d'émission ci-dessus. */}
        <div className="mt-12 pt-6 border-t border-gray-100 text-center space-y-1">
          <p className="text-xs text-gray-500">
            Ce devis est une proposition de soins chiffrée : ce n&apos;est ni une facture, ni un reçu.
            Chaque paiement donne lieu à une facture distincte.
          </p>
          <p className="text-xs text-gray-400">Devis imprimé le {formatDateFr(new Date())} via MonRDV</p>
        </div>
      </div>
    </div>
  )
}
