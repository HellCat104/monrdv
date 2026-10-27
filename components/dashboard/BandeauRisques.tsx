'use client'

// LA BANNIÈRE DE RISQUES — ce qui doit se voir AVANT le geste.
//
// Elle ne va pas chercher ses données : on les lui passe. Un même dossier
// l'affiche deux fois (en tête, puis au-dessus de l'odontogramme) et il serait
// absurde d'interroger la base deux fois pour la même ligne.
//
// Trois états, et aucun n'est le silence :
//   • des risques → ils s'affichent, du plus grave au moins grave ;
//   • rien de signalé → une ligne verte sobre, qui DIT que le questionnaire a
//     été rempli. « Aucune alerte » et « personne n'a demandé » ne se
//     ressemblent pas, et les confondre est exactement ce qui fait extraire
//     une dent chez un patient sous Sintrom ;
//   • pas rempli → une invitation ambre, visible, qui mène au questionnaire.
import { useState } from 'react'
import { AlertTriangle, ShieldCheck, HelpCircle, ClipboardList, ChevronDown } from 'lucide-react'
import type { Risque } from '@/lib/anamnese'
import { formatDateFr } from '@/lib/utils'

const COULEURS = {
  majeur: { fond: 'bg-red-50',    bord: 'border-red-200',    titre: 'text-red-800',    texte: 'text-red-600',    puce: 'bg-red-500' },
  modere: { fond: 'bg-amber-50',  bord: 'border-amber-200',  titre: 'text-amber-800',  texte: 'text-amber-700',  puce: 'bg-amber-500' },
  info:   { fond: 'bg-slate-50',  bord: 'border-slate-200',  titre: 'text-slate-700',  texte: 'text-slate-500',  puce: 'bg-slate-400' },
} as const

export default function BandeauRisques({
  risques, verifier = [], remplie, ancienne = false, maj, compact = false, onOuvrir,
}: {
  risques: Risque[]
  verifier?: Risque[]
  remplie: boolean
  ancienne?: boolean
  maj?: string | null
  /** Version d'une ligne, pour coiffer l'odontogramme sans l'écraser. */
  compact?: boolean
  onOuvrir?: () => void
}) {
  const [deplie, setDeplie] = useState(false)
  const majeurs = risques.filter((r) => r.gravite === 'majeur')
  const pireCouleur = majeurs.length > 0 ? COULEURS.majeur
    : risques.some((r) => r.gravite === 'modere') ? COULEURS.modere : COULEURS.info

  // ── Questionnaire jamais rempli ────────────────────────────────────────────
  if (!remplie && risques.length === 0) {
    return (
      <button
        type="button" onClick={onOuvrir}
        className="w-full text-left bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2 hover:bg-amber-100 transition"
      >
        <ClipboardList className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <span className="text-[12px] text-amber-800">
          <b>Anamnèse non renseignée.</b> Anticoagulant, allergie, valve, bisphosphonates :
          rien n’a encore été demandé à ce patient. {onOuvrir ? 'Remplir le questionnaire.' : ''}
        </span>
      </button>
    )
  }

  // ── Rempli, rien à signaler ───────────────────────────────────────────────
  if (risques.length === 0 && verifier.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-[12px] text-emerald-800">
          Anamnèse renseignée, aucun risque signalé
          {maj ? <span className="text-emerald-600"> · le {formatDateFr(maj)}</span> : null}
        </span>
        {ancienne && (
          <button type="button" onClick={onOuvrir} className="ml-auto text-[11px] text-emerald-700 underline shrink-0">
            à reconfirmer
          </button>
        )}
      </div>
    )
  }

  // ── Version compacte : une ligne, dépliable ───────────────────────────────
  if (compact && !deplie) {
    return (
      <button
        type="button" onClick={() => setDeplie(true)}
        className={`w-full text-left ${pireCouleur.fond} border ${pireCouleur.bord} rounded-lg px-2.5 py-2 flex items-center gap-2 hover:brightness-[0.98] transition`}
      >
        <AlertTriangle className={`h-4 w-4 ${pireCouleur.titre} shrink-0`} />
        <span className={`text-[12px] font-semibold ${pireCouleur.titre} truncate`}>
          {risques.slice(0, 3).map((r) => r.titre).join(' · ')}
          {risques.length > 3 ? ` · +${risques.length - 3}` : ''}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 ${pireCouleur.texte} ml-auto shrink-0`} />
      </button>
    )
  }

  return (
    <div className={`${pireCouleur.fond} border ${pireCouleur.bord} rounded-lg p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className={`h-4 w-4 ${pireCouleur.titre} shrink-0`} />
        <span className={`text-[12px] font-semibold ${pireCouleur.titre}`}>
          À savoir avant tout acte
        </span>
        {maj && (
          <span className={`text-[11px] ${pireCouleur.texte} ml-auto`}>
            anamnèse du {formatDateFr(maj)}
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {risques.map((r) => {
          const c = COULEURS[r.gravite]
          return (
            <li key={r.cle} className="flex items-start gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${c.puce}`} />
              <div className="min-w-0">
                <p className={`text-[12px] font-medium ${c.titre}`}>
                  {r.titre}
                  {r.precision && <span className={`font-normal ${c.texte}`}> — {r.precision}</span>}
                </p>
                {/* Ce que ça CHANGE à la séance. Pas une posologie : un rappel. */}
                {r.conduite && <p className={`text-[11px] ${c.texte}`}>{r.conduite}</p>}
              </div>
            </li>
          )
        })}
      </ul>

      {/* « Ne sait pas » sur un point majeur : une inconnue sur l'hémostase
          n'est pas une absence de risque, elle se résout avant le geste. */}
      {verifier.length > 0 && (
        <div className="pt-1.5 border-t border-black/5 flex items-start gap-2">
          <HelpCircle className="h-3.5 w-3.5 text-gray-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-600">
            <b>À confirmer auprès du patient :</b> {verifier.map((r) => r.titre).join(' · ')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        {ancienne && (
          <p className="text-[11px] text-gray-600 italic">
            Anamnèse de plus d’un an : à reconfirmer avec le patient.
          </p>
        )}
        {onOuvrir && (
          <button type="button" onClick={onOuvrir} className={`text-[11px] underline ${pireCouleur.texte} ml-auto`}>
            Voir / modifier l’anamnèse
          </button>
        )}
        {compact && (
          <button type="button" onClick={() => setDeplie(false)} className="text-[11px] text-gray-400 hover:text-gray-600">
            Replier
          </button>
        )}
      </div>
    </div>
  )
}
