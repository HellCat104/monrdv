// LA SYNTHÈSE AVANT CONSULTATION — ce qu'il faut savoir avant de toucher une dent.
//
// Tout vient du dossier, rien n'est saisi ici : dernière visite et son
// diagnostic, plan de traitement en cours, dernière radio. Calculée côté
// serveur (lib/espace-dentaire), elle s'affiche avec l'écran, sans attente.
//
// Les allergies et les risques n'y sont PAS répétés : le bandeau rouge juste
// au-dessus les porte déjà. Deux encadrés qui disent la même chose à trente
// pixels d'écart apprennent à l'œil à sauter les deux.
import Link from 'next/link'
import { CalendarClock, ClipboardList, ScanLine, FileText } from 'lucide-react'
import { formatDateFr } from '@/lib/utils'
import type { SyntheseDentaire } from '@/lib/espace-dentaire'

export default function SyntheseConsultation({ synthese, retour }: {
  synthese: SyntheseDentaire
  /** L'adresse où revenir après avoir lu un compte rendu. */
  retour: string
}) {
  const { derniereVisite: v, planActif: plan, derniereRadio: rx } = synthese

  if (!v && !plan && !rx && synthese.plansEnAttente === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Synthèse</p>
        <p className="mt-1 text-sm text-gray-500">Première visite au cabinet : aucun antécédent dentaire enregistré.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Synthèse</p>

      {v && (
        <div className="flex gap-2.5">
          <CalendarClock className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="text-gray-500 text-xs">Dernière visite · {formatDateFr(v.date)}</p>
            {v.motif && <p className="text-gray-800">{v.motif}</p>}
            {v.diagnostic && <p className="text-gray-800"><span className="text-gray-500">Diagnostic :</span> {v.diagnostic}</p>}
            {v.consultationId && (
              <Link
                href={`/dentaire/consultation/cr/${v.consultationId}?back=${encodeURIComponent(retour)}`}
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline mt-0.5"
              >
                <FileText className="h-3 w-3" /> Compte rendu
              </Link>
            )}
          </div>
        </div>
      )}

      {plan && (
        <div className="flex gap-2.5">
          <ClipboardList className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="text-gray-500 text-xs">Plan de traitement en cours</p>
            <p className="text-gray-800">{plan.titre}</p>
            <p className="text-gray-600 text-xs">
              {plan.restants === 0
                ? 'Tous les actes sont faits'
                : `${plan.restants} acte${plan.restants > 1 ? 's' : ''} à faire · ${plan.faits} fait${plan.faits > 1 ? 's' : ''}`}
            </p>
            {plan.prochain && plan.restants > 0 && (
              <p className="text-xs text-primary-700 mt-0.5">Prochain : {plan.prochain}</p>
            )}
          </div>
        </div>
      )}
      {synthese.plansEnAttente > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          {synthese.plansEnAttente === 1
            ? 'Un devis proposé attend la réponse du patient.'
            : `${synthese.plansEnAttente} devis proposés attendent la réponse du patient.`}
        </p>
      )}

      {rx && (
        <div className="flex gap-2.5">
          <ScanLine className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="text-gray-500 text-xs">
              Dernière radio · {formatDateFr(rx.date)}{rx.estime ? ' (date de dépôt)' : ''}
            </p>
            <p className="text-gray-800">
              {rx.type}
              {rx.dents.length > 0 && <span className="text-gray-500"> · dent{rx.dents.length > 1 ? 's' : ''} {rx.dents.join(', ')}</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
